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
import { iosSafeDownload } from '../utils/iosSafeDownload';
import { platformDownload, downloadFile } from '../utils/downloadFile';
import { SectionLockBanner, SectionLockedOverlay } from '../components/security/SectionLock';
import { Skeleton } from '../components/ui/skeleton';
import { Checkbox } from '../components/ui/checkbox';
import SlidePanel from '../components/SlidePanel';
import { resolvePhotoUrl } from '../utils/photoUrl';
import { API_URL } from '../config';
import VideoPlaybackModal from '../components/messages/VideoPlaybackModal';
import MessageCard from '../components/messages/MessageCard';
import MMGuidedWizard from '../components/messages/MMGuidedWizard';
import { useDraftState } from '../hooks/useDraftState';
import VideoRecordingOverlay from '../components/messages/VideoRecordingOverlay';
import { getOfflineMode } from '../offline/featureFlag';
import { getLocalEstates } from '../offline/repos/estatesRepo';
import { getLocalBeneficiaries, upsertLocalBeneficiaries } from '../offline/repos/beneficiariesRepo';
import { getLocalMessages, upsertLocalMessages, upsertLocalMessagesPreservingPending } from '../offline/repos/messagesRepo';

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
  // Draft persistence — read estateId synchronously from localStorage
  // so the per-estate draft key is stable from first render. If the
  // user is mid-creating a message and navigates away, returning to
  // /messages reopens the modal with all text fields restored.
  // Binary attachments (video/audio/files) are intentionally NOT
  // persisted — sessionStorage can't hold blobs and stale recordings
  // would be confusing on resume.
  const draftEstateId = (typeof localStorage !== 'undefined' && localStorage.getItem('selected_estate_id')) || null;
  const draftBase = draftEstateId ? `mm_form:${draftEstateId}` : null;
  const [showCreateModal, setShowCreateModal] = useDraftState(draftBase ? `${draftBase}:open` : null, false);
  const [creating, setCreating] = useState(false);
  // Synchronous guard against double-submit (see handleCreate) — useState
  // updates are async, so disabled={creating} alone leaks rapid taps.
  const createInFlightRef = useRef(false);
  const [editingMessage, setEditingMessage, clearEditingDraft] = useDraftState(draftBase ? `${draftBase}:editing` : null, null);
  const [activeTab, setActiveTab] = useState('all');
  // Guided mode — simplified wizard for onboarding
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(1);
  const autoOpenedRef = useRef(false);
  
  // Form state (text fields persisted; binary attachments are not)
  const [title, setTitle, clearTitleDraft] = useDraftState(draftBase ? `${draftBase}:title` : null, '');
  const [content, setContent, clearContentDraft] = useDraftState(draftBase ? `${draftBase}:content` : null, '');
  const [messageType, setMessageType, clearMessageTypeDraft] = useDraftState(draftBase ? `${draftBase}:type` : null, 'text');
  const [selectedRecipients, setSelectedRecipients, clearRecipientsDraft] = useDraftState(draftBase ? `${draftBase}:recipients` : null, []);
  const [triggerType, setTriggerType, clearTriggerTypeDraft] = useDraftState(draftBase ? `${draftBase}:triggerType` : null, 'immediate');
  const [triggerValue, setTriggerValue, clearTriggerValueDraft] = useDraftState(draftBase ? `${draftBase}:triggerValue` : null, '');
  const [triggerAge, setTriggerAge, clearTriggerAgeDraft] = useDraftState(draftBase ? `${draftBase}:triggerAge` : null, '');
  const [triggerDate, setTriggerDate, clearTriggerDateDraft] = useDraftState(draftBase ? `${draftBase}:triggerDate` : null, '');
  const [customEventLabel, setCustomEventLabel, clearCustomEventDraft] = useDraftState(draftBase ? `${draftBase}:customEvent` : null, '');
  // Aggregator that wipes persisted MM form FIELD keys in one shot.
  // Intentionally does NOT clear `:open` — the modal-open flag is
  // managed by setShowCreateModal itself (true on open, false on
  // close). Bundling :open into the bulk-clear caused the "+ Create
  // Message" click handler to arm a skip flag that swallowed the
  // subsequent setShowCreateModal(true) write — so the modal never
  // re-opened on a later navigate-away-and-back.
  const clearMMDraft = () => {
    clearEditingDraft();
    clearTitleDraft();
    clearContentDraft();
    clearMessageTypeDraft();
    clearRecipientsDraft();
    clearTriggerTypeDraft();
    clearTriggerValueDraft();
    clearTriggerAgeDraft();
    clearTriggerDateDraft();
    clearCustomEventDraft();
  };
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
  // When the user edits a still-queued offline milestone, we hydrate
  // its blob from IndexedDB and remember the row's pendingUpload PK
  // here so handleCreate can patch the queue entry in-place rather
  // than firing an axios PUT against a `pending_*` id (which 404s).
  const editingPendingUploadIdRef = useRef(null);
  const editingPendingOriginalBlobRef = useRef(null);

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

  // Auto-refresh when a queued milestone media upload finishes draining
  // on reconnect — swaps the "queued" UI for the server-authoritative row.
  useEffect(() => {
    const refetch = () => { fetchData(); };
    window.addEventListener('carryon:upload:complete', refetch);
    window.addEventListener('carryon:outbox:drained', refetch);
    return () => {
      window.removeEventListener('carryon:upload:complete', refetch);
      window.removeEventListener('carryon:outbox:drained', refetch);
    };
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
    // Offline read-through: paint from the local mirror first so
    // airplane-mode users see their real estate, beneficiaries, and MM
    // list instead of a spurious "Create your first milestone" empty
    // state. The rescue fires whenever offline mode is enabled OR the
    // browser reports the device is offline — the `mode === 'on'`-only
    // gate silently excluded the default-off majority and caused all
    // previously-cached data to vanish on airplane-mode toggle.
    const mode = getOfflineMode();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (mode !== 'off' || isOffline) {
      try {
        const localEstates = await getLocalEstates();
        if (localEstates && localEstates.length > 0) {
          const savedId = localStorage.getItem('selected_estate_id');
          const selected = (savedId && localEstates.find(e => e.id === savedId)) || localEstates[0];
          if (selected) {
            setEstate(selected);
            const [localMsgs, localBens] = await Promise.all([
              getLocalMessages(selected.id),
              getLocalBeneficiaries(selected.id),
            ]);
            if (localMsgs.length > 0) setMessages(localMsgs);
            if (localBens.length > 0) setBeneficiaries(localBens);
            // Unblock the UI immediately; server refresh runs below when
            // reachable and reconciles.
            if (localMsgs.length > 0 || localBens.length > 0 || isOffline) {
              setLoading(false);
            }
          }
        }
      } catch (err) { console.warn('[offline] MM local read failed:', err); }

      // Skip the server fetch entirely when we know we're offline —
      // prevents a doomed axios call and its misleading error toast.
      if (isOffline) {
        setLoading(false);
        return;
      }
    }

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
        // Always mirror the canonical server list into IndexedDB so the
        // airplane-mode short-circuit (above) has data to rehydrate from
        // even on iOS installed PWAs that hard-remount on airplane toggle.
        // Use the preserving variant so locally-queued offline messages
        // (with `_pending: true`) aren't blown away while their video
        // is still in-flight via the chunked upload queue.
        upsertLocalMessagesPreservingPending(selected.id, msgsRes.data).catch(() => {});
        upsertLocalBeneficiaries(selected.id, bensRes.data).catch(() => {});
      }
    } catch (error) {
      console.error('Fetch error:', error);
      // The global offline banner already communicates "You're offline" —
      // a duplicate "Failed to load messages" toast is just noise and makes
      // the user think something is actually broken. Only surface the toast
      // for real server-side failures while online AND when we have no
      // cached data already painted on screen. The offline-first paint
      // above hydrates from IndexedDB; if that succeeded we silently
      // retry network without alarming the user (the iter_106 ECT toast
      // leak case during a B2B pitch).
      const haveOfflinePaint = messages.length > 0 || beneficiaries.length > 0;
      if ((typeof navigator === 'undefined' || navigator.onLine !== false) && !haveOfflinePaint) {
        toast.error('Failed to load messages');
      }
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

      // Capture thumbnail from live video feed.
      // The thumbnail's aspect ratio MUST match the recording's actual
      // orientation — using a hardcoded 320x180 (16:9 landscape) here
      // squashed iPhone front-camera portrait recordings into a wide
      // strip on the message card (founder report May 3 2026). Now we
      // sample the camera's real videoWidth/videoHeight and downscale
      // to a 320px max edge while preserving the natural ratio.
      try {
        if (videoRef.current) {
          const vw = videoRef.current.videoWidth || 320;
          const vh = videoRef.current.videoHeight || 180;
          const MAX = 320;
          const scale = Math.min(MAX / vw, MAX / vh, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(vw * scale) || 320;
          canvas.height = Math.round(vh * scale) || 180;
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
    // Synchronous in-flight guard — React's setCreating(true) is async, so
    // a rapid double-click within ~50ms can fire two handleCreate calls
    // before disabled state propagates. iter_105 caught two POSTs hitting
    // /api/messages on a B2B-demo-style double-tap; the useRef below
    // returns true synchronously and rejects the second call before the
    // network ever fires.
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;

    if (!title) { toast.error('Message Title is required'); createInFlightRef.current = false; return; }
    if (!content) { toast.error('Message Content is required'); createInFlightRef.current = false; return; }
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one recipient');
      createInFlightRef.current = false;
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

      // Pending-row edit short-circuit: if the row being edited is a
      // still-queued offline milestone (id starts with `pending_` or
      // `_pending: true`), it has NO server id — an axios PUT here
      // would 404. Instead, patch the local optimistic message + the
      // pendingUpload row's metadata in IndexedDB. The drainer reads
      // the latest metadata.message_create when it finalizes the
      // upload, so the edit naturally rides out with the original
      // recording. If the user re-recorded, swap the blob too. If
      // they Removed (videoBlob/audioBlob === null) cancel the
      // pending milestone entirely.
      const isPendingEdit = !!editingMessage && (
        editingMessage._pending === true
        || (typeof editingMessage.id === 'string' && editingMessage.id.startsWith('pending_'))
      );
      if (isPendingEdit) {
        try {
          const { getPendingUpload, updatePendingUpload, deletePendingUpload } = await import('../offline/pendingUploadsRepo');
          const { updateLocalMessage, deleteLocalMessage } = await import('../offline/repos/messagesRepo');
          const pendingUploadId = editingPendingUploadIdRef.current;

          // User wiped the recording — abandon the queued milestone.
          if (!videoBlob && !audioBlob) {
            if (pendingUploadId) await deletePendingUpload(pendingUploadId).catch(() => {});
            await deleteLocalMessage(editingMessage.id).catch(() => {});
            setMessages(prev => prev.filter(m => m.id !== editingMessage.id));
            try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { source: 'pending_milestone_removed' } })); } catch { /* SSR */ }
            toast.success('Pending milestone removed.');
            setShowCreateModal(false);
            setEditingMessage(null);
            resetForm();
            return;
          }

          // Patch the pending upload's metadata.message_create so the
          // drainer sees the edited fields when it finalizes.
          if (pendingUploadId) {
            const existing = await getPendingUpload(pendingUploadId);
            if (existing) {
              const nextMetadata = {
                ...(existing.metadata || {}),
                message_create: {
                  ...(existing.metadata?.message_create || {}),
                  title,
                  content,
                  message_type: messageType,
                  recipients: selectedRecipients,
                  trigger_type: triggerType,
                  trigger_value: triggerValue || null,
                  trigger_age: triggerAge ? parseInt(triggerAge) : null,
                  trigger_date: triggerDate || null,
                  custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
                  video_thumbnail: videoThumbnail || existing.metadata?.message_create?.video_thumbnail || null,
                },
              };
              const newBlob = (videoBlob && videoBlob !== 'existing' && videoBlob !== editingPendingOriginalBlobRef.current)
                ? videoBlob
                : (audioBlob && audioBlob !== editingPendingOriginalBlobRef.current ? audioBlob : null);
              const patch = { metadata: nextMetadata };
              if (newBlob) {
                patch.blob = newBlob;
                patch.size_bytes = newBlob.size;
                patch.mime_type = newBlob.type || existing.mime_type;
                patch.bytes_sent = 0;
                patch.upload_id = null;
                patch.status = 'queued';
              }
              await updatePendingUpload(pendingUploadId, patch);
            }
          }

          // Mirror the edits onto the optimistic local row so the
          // Messages list reflects them immediately.
          await updateLocalMessage(editingMessage.id, {
            title,
            content,
            message_type: messageType,
            recipients: selectedRecipients,
            trigger_type: triggerType,
            trigger_value: triggerValue || null,
            trigger_age: triggerAge ? parseInt(triggerAge) : null,
            trigger_date: triggerDate || null,
            custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
            video_thumbnail: videoThumbnail || editingMessage.video_thumbnail || null,
          }).catch(() => {});
          setMessages(prev => prev.map(m => (
            m.id === editingMessage.id
              ? {
                  ...m,
                  title,
                  content,
                  message_type: messageType,
                  recipients: selectedRecipients,
                  trigger_type: triggerType,
                  trigger_value: triggerValue || null,
                  trigger_age: triggerAge ? parseInt(triggerAge) : null,
                  trigger_date: triggerDate || null,
                  custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
                  video_thumbnail: videoThumbnail || m.video_thumbnail || null,
                }
              : m
          )));

          try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { source: 'pending_milestone_edited' } })); } catch { /* SSR */ }
          toast.success('Pending milestone updated — will send when you reconnect.');
          setShowCreateModal(false);
          setEditingMessage(null);
          resetForm();
          return;
        } catch (perr) {
          console.warn('[offline] pending edit save failed:', perr);
          toast.error('Could not update pending milestone. Please try again.');
          return;
        }
      }

      // Tier B wiring — if we're offline AND the user recorded a video,
      // short-circuit to the chunked-upload queue. The backend's
      // milestone finalizer will create the Message row AND attach the
      // video in one atomic call when the queue drains. Keeps
      // offline-captured 5-minute recordings reliably in flight.
      // Flag-agnostic as of Apr 24, 2026: runs for every user whenever
      // the device is offline, because there is literally no other way
      // to save the recording.
      //
      // May 3 2026: switched from `navigator.onLine` to the
      // `window.__isDeviceOffline()` helper from index.js — on iOS
      // PWAs `navigator.onLine` can report TRUE even in airplane mode,
      // which was sending video-milestone saves straight to the axios
      // POST path and producing "Failed to create message: offline"
      // toasts instead of queueing the recording. The helper tracks
      // the authoritative `offline` window event so we get a correct
      // answer inside installed PWAs too.
      const hasVideo = videoBlob && videoBlob !== 'existing';
      const hasAudio = !!audioBlob;
      try {
        const isOffline = (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
          ? window.__isDeviceOffline()
          : (typeof navigator !== 'undefined' && navigator.onLine === false);
        if (isOffline && !editingMessage && (hasVideo || hasAudio)) {
          const { addPendingUpload } = await import('../offline/pendingUploadsRepo');
          const { insertLocalMessage } = await import('../offline/repos/messagesRepo');
          // Synthesize a stable client-side id so the optimistic row
          // and the queued upload reference the same logical message.
          // The drainer's finalizer will reuse this id when it confirms
          // the server-side row, so the UI swap is seamless.
          const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const messageCreate = {
            estate_id: estate.id,
            title,
            content,
            message_type: messageType,
            recipients: selectedRecipients,
            trigger_type: triggerType,
            trigger_value: triggerValue || null,
            trigger_age: triggerAge ? parseInt(triggerAge) : null,
            trigger_date: triggerDate || null,
            custom_event_label: triggerValue === 'custom' ? customEventLabel : null,
            video_thumbnail: videoThumbnail,
          };
          if (hasVideo) {
            await addPendingUpload({
              kind: 'milestone_video',
              filename: `milestone-${Date.now()}.webm`,
              mime_type: videoBlob.type || 'video/webm',
              blob: videoBlob,
              metadata: { message_create: messageCreate, pending_id: pendingId },
            });
            // Optimistic local row so the MM list paints this message
            // INSTANTLY rather than dropping back to the empty state.
            await insertLocalMessage({
              id: pendingId,
              ...messageCreate,
              has_video: true,
              has_audio: false,
              created_at: new Date().toISOString(),
            });
            // Tell any open MessagesPage view to refetch from the
            // local cache — same event the drainer fires on success.
            try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { source: 'optimistic_milestone' } })); } catch {}
            toast.success('Video queued — we\'ll send your milestone when you reconnect.');
          } else if (hasAudio) {
            await addPendingUpload({
              kind: 'milestone_audio',
              filename: `milestone-${Date.now()}.webm`,
              mime_type: audioBlob.type || 'audio/webm',
              blob: audioBlob,
              metadata: { message_create: messageCreate, pending_id: pendingId },
            });
            await insertLocalMessage({
              id: pendingId,
              ...messageCreate,
              has_video: false,
              has_audio: true,
              created_at: new Date().toISOString(),
            });
            try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { source: 'optimistic_milestone' } })); } catch {}
            toast.success('Voice message queued — we\'ll send it when you reconnect.');
          }
          setShowCreateModal(false);
          setEditingMessage(null);
          resetForm();
          return;
        }
      } catch (qerr) {
        // Fall through to the online path if queueing failed — better
        // to surface the real error than silently drop the recording.
        console.warn('[offline] milestone queue skipped:', qerr);
      }

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

      // Offline write path (flag-agnostic): when the device is offline
      // AND there's no media attachment (media uses the chunked-upload
      // queue above), fall through to mutateWithOutbox. A local-only
      // optimistic row is inserted into `messages` so the list renders
      // immediately, and the POST/PUT is replayed on reconnect.
      // Uses the authoritative __isDeviceOffline helper (iOS PWA
      // navigator.onLine lies — see the hasVideo block above).
      {
        const isOffline = (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
          ? window.__isDeviceOffline()
          : (typeof navigator !== 'undefined' && navigator.onLine === false);
        const hasMedia = hasVideo || hasAudio || !!attachmentFile;
        if (isOffline && !hasMedia) {
          const { mutateWithOutbox } = await import('../utils/offlineMutation');
          const { upsertLocalMessages } = await import('../offline/repos/messagesRepo');
          if (editingMessage) {
            await mutateWithOutbox({
              entity_type: 'milestone_message',
              entity_id: editingMessage.id,
              method: 'PUT',
              url: `/messages/${editingMessage.id}`,
              body: payload,
              authHeaders: getAuthHeaders(),
            });
            const patched = messages.map(m => m.id === editingMessage.id ? { ...m, ...payload, _local_pending: true } : m);
            setMessages(patched);
            if (estate?.id) upsertLocalMessages(estate.id, patched).catch(() => {});
            toast.success('Change queued — will sync when you reconnect.');
          } else {
            const tempId = `local-mm-${(crypto?.randomUUID?.() || Date.now())}`;
            const optimistic = { ...payload, id: tempId, estate_id: estate.id, created_at: new Date().toISOString(), _local_pending: true };
            await mutateWithOutbox({
              entity_type: 'milestone_message',
              entity_id: tempId,
              method: 'POST',
              url: '/messages',
              body: { ...payload, estate_id: estate.id },
              authHeaders: getAuthHeaders(),
            });
            const next = [optimistic, ...messages];
            setMessages(next);
            if (estate?.id) upsertLocalMessages(estate.id, next).catch(() => {});
            toast.success('Milestone message queued — will sync when you reconnect.');
          }
          setShowCreateModal(false);
          setEditingMessage(null);
          resetForm();
          return;
        }
      }

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
      // If the error was the axios interceptor short-circuiting because
      // the device is offline, the user's video/recording may have been
      // lost before the offline-queue branch could catch it. Show a
      // clearer message than a raw "Failed to create message: offline"
      // so it's obvious the fix is to stay on the screen and retry,
      // not that something went catastrophically wrong. The queued
      // path above SHOULD handle this in the common case (iOS PWA,
      // navigator.onLine lies) — but this is a safety net for the
      // rare case where the device flipped from online to offline
      // between the check and the axios call.
      const isOfflineErr = error?.code === 'ERR_OFFLINE'
        || error?.message === 'offline'
        || (!error?.response && (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function' && window.__isDeviceOffline(error)));
      if (isOfflineErr) {
        toast.error(`You appear to be offline. Your recording is safe — please stay on this screen and tap Save again when you reconnect.`);
      } else {
        const detail = error.response?.data?.detail || error.message || 'Unknown error';
        toast.error(`Failed to ${editingMessage ? 'update' : 'create'} message: ${detail}`);
      }
    } finally {
      setCreating(false);
      createInFlightRef.current = false;
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const isOffline = (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
        ? window.__isDeviceOffline()
        : (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (isOffline) {
        const { mutateWithOutbox } = await import('../utils/offlineMutation');
        const { upsertLocalMessages } = await import('../offline/repos/messagesRepo');
        await mutateWithOutbox({
          entity_type: 'milestone_message',
          entity_id: messageId,
          method: 'DELETE',
          url: `/messages/${messageId}`,
          authHeaders: getAuthHeaders(),
        });
        const next = messages.filter(m => m.id !== messageId);
        setMessages(next);
        if (estate?.id) upsertLocalMessages(estate.id, next).catch(() => {});
        toast.success('Deletion queued — will sync when you reconnect.');
        return;
      }
      await axios.delete(`${API_URL}/messages/${messageId}`, getAuthHeaders());
      // toast removed
      setMessages(messages.filter(m => m.id !== messageId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleDownload = async (msg) => {
    try {
      const { canOpenCloudFile } = await import('../utils/offlineGuard');
      if (!canOpenCloudFile({ kind: 'milestone' })) return;
    } catch { /* non-fatal */ }
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
    clearMMDraft();
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
    editingPendingUploadIdRef.current = null;
    editingPendingOriginalBlobRef.current = null;
    releaseCamera();
  };

  const openEdit = async (msg) => {
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

    // Reset edit-context refs from any prior edit before we (maybe)
    // re-populate them below for a still-queued offline row.
    editingPendingUploadIdRef.current = null;
    editingPendingOriginalBlobRef.current = null;
    setVideoBlob(null);
    setVideoUrl(null);
    setVideoPosterUrl(null);
    setAudioBlob(null);
    setAudioUrl(null);

    // If this is a locally-queued, not-yet-uploaded offline milestone,
    // its video/audio bytes live in the `pendingUpload` IndexedDB
    // table — keyed by `metadata.pending_id === msg.id`. Hydrate the
    // form's media state from there so the existing recording is
    // visible in the modal and we can patch it in-place on save
    // without losing the original.
    const isPending = msg?._pending === true || (typeof msg?.id === 'string' && msg.id.startsWith('pending_'));
    if (!isPending) return;
    try {
      const { getDB } = await import('../offline/db');
      const db = getDB();
      const pending = await db.pendingUpload
        .filter((r) => r?.metadata?.pending_id === msg.id)
        .first();
      if (!pending?.blob) return;
      editingPendingUploadIdRef.current = pending.id;
      editingPendingOriginalBlobRef.current = pending.blob;
      const blobUrl = URL.createObjectURL(pending.blob);
      if (pending.kind === 'milestone_video') {
        setVideoBlob(pending.blob);
        setVideoUrl(blobUrl);
        if (msg.video_thumbnail) {
          setVideoPosterUrl(`data:image/jpeg;base64,${msg.video_thumbnail}`);
        }
      } else if (pending.kind === 'milestone_audio') {
        setAudioBlob(pending.blob);
        setAudioUrl(blobUrl);
      }
    } catch (err) {
      console.warn('[offline] hydrate pending edit failed:', err);
    }
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
      await iosSafeDownload(res.data, msg.attachment_name || 'attachment', 'Attachment', 'mm_attachment');
    } catch { toast.error('Failed to download attachment'); }
  };


  const playVideo = async (msg) => {
    // Offline-pending row playback: if this message was queued offline
    // (no server `video_url` yet) AND we have its blob in the
    // pendingUploads store, play directly from the local bytes. That's
    // the whole point of the founder being able to "recall it offline
    // without any issue" — the recording lives on this device until
    // the upload drains, and we should let them watch it back.
    if (!msg.video_url) {
      try {
        const { getDB } = await import('../offline/db');
        const db = getDB();
        const id = msg.id;
        // The pending upload row's metadata.pending_id matches the
        // optimistic message row's id (set in the offline-queue branch
        // of handleSave above).
        const pending = await db.pendingUpload
          .filter((r) => r?.metadata?.pending_id === id)
          .first();
        if (pending?.blob) {
          setPlayingVideoUrl(URL.createObjectURL(pending.blob));
          return;
        }
      } catch { /* fall through to error toast below */ }
      toast.error('This recording is still queued — it will sync when you reconnect.');
      return;
    }
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
                <div className="flex justify-center">
                  <Button className="gold-button text-sm sm:text-base px-5 sm:px-8 py-3" onClick={() => { setEditingMessage(null); resetForm(); setShowCreateModal(true); }}>
                    <Plus className="w-5 h-5 mr-2 flex-shrink-0" />
                    <span>Create Your First Milestone Message</span>
                  </Button>
                </div>
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
          <MMGuidedWizard
            guidedStep={guidedStep}
            setGuidedStep={setGuidedStep}
            title={title}
            setTitle={setTitle}
            content={content}
            setContent={setContent}
            toggleSpeechToText={toggleSpeechToText}
            isSpeechListening={isSpeechListening}
            beneficiaries={beneficiaries}
            selectedRecipients={selectedRecipients}
            setSelectedRecipients={setSelectedRecipients}
            handleCreate={handleCreate}
            creating={creating}
          />
        ) : (
          /* ===== NORMAL MODE: Full-featured form ===== */
          <>
          <div className="space-y-5">
            {/* Message Type Toggle — 4-col grid guarantees fit on every mobile width */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <Button
                variant={messageType === 'text' ? 'default' : 'outline'}
                onClick={() => setMessageType('text')}
                className={`${messageType === 'text' ? 'gold-button' : 'border-[var(--b)] text-white'} w-full min-w-0 px-1.5 sm:px-3 text-[13px] sm:text-sm`}
                data-testid="msg-type-text"
              >
                <MessageSquare className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">Written</span>
              </Button>
              <Button
                variant={messageType === 'voice' ? 'default' : 'outline'}
                onClick={() => setMessageType('voice')}
                className={`${messageType === 'voice' ? 'gold-button' : 'border-[var(--b)] text-white'} w-full min-w-0 px-1.5 sm:px-3 text-[13px] sm:text-sm`}
                data-testid="msg-type-voice"
              >
                <Mic className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">Voice</span>
              </Button>
              <Button
                variant={messageType === 'video' ? 'default' : 'outline'}
                onClick={() => setMessageType('video')}
                className={`${messageType === 'video' ? 'gold-button' : 'border-[var(--b)] text-white'} w-full min-w-0 px-1.5 sm:px-3 text-[13px] sm:text-sm`}
                data-testid="msg-type-video"
              >
                <Video className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">Video</span>
              </Button>
              <Button
                variant={messageType === 'attachment' ? 'default' : 'outline'}
                onClick={() => setMessageType('attachment')}
                className={`${messageType === 'attachment' ? 'gold-button' : 'border-[var(--b)] text-white'} w-full min-w-0 px-1.5 sm:px-3 text-[13px] sm:text-sm`}
                data-testid="msg-type-attachment"
              >
                <Paperclip className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Attach</span>
                  <span className="hidden sm:inline">Attachment</span>
                </span>
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
                          <img
                            src={resolvePhotoUrl(ben.photo_url)}
                            alt={ben.name}
                            className="w-full h-full object-cover"
                            // Bias slightly upward — most face-pose photos have
                            // the face in the upper third of the frame. Keeps
                            // Lanna-Mitchell-style "white circle" away from
                            // demos when the upload predates the top-biased
                            // backend crop.
                            style={{ objectPosition: 'center 30%' }}
                            onError={(e) => {
                              // If the avatar image 404s, expires (S3 presigned),
                              // or stalls mid-decode, swap to the colored
                              // initials block so we never render a half-loaded
                              // ghost avatar in front of clients.
                              const wrap = e.currentTarget.parentElement;
                              if (wrap) {
                                wrap.style.backgroundColor = (ben.avatar_color || '#60A5FA') + '30';
                                wrap.style.color = ben.avatar_color || '#60A5FA';
                                wrap.textContent = ben.initials || '';
                              }
                            }}
                          />
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
