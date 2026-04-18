/**
 * useECTMedia — manages file attachment uploads and voice recording.
 * All logic moved verbatim from EstateChatPage.js.
 */
import { useState } from 'react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export default function useECTMedia({ token, activeChannel, fetchMessages, fetchChannels, voiceRecorder, scrollContainerRef }) {
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [voicePreview, setVoicePreview] = useState(null); // {blob, url}

  const uploadFile = async (file) => {
    if (!activeChannel || !file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to send attachment');
      }
    } catch {
      toast.error('Failed to send attachment');
    } finally { setUploading(false); }
  };

  const uploadMultipleFiles = async (fileList) => {
    if (!activeChannel || !fileList.length) return;
    setUploading(true);
    try {
      const endpoint = fileList.length === 1 ? 'upload' : 'upload-multi';
      const fd = new FormData();
      if (fileList.length === 1) {
        fd.append('file', fileList[0].file);
      } else {
        fileList.forEach(({ file }) => fd.append('files', file));
      }
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.detail || 'Failed to send attachments');
      }
    } catch {
      toast.error('Failed to send attachments');
    } finally { setUploading(false); }
  };

  const sendVoiceMessage = async (previewBlob) => {
    const blob = previewBlob || await voiceRecorder.stop();
    if (!blob || !activeChannel) return;
    if (voicePreview) { URL.revokeObjectURL(voicePreview.url); setVoicePreview(null); }
    setUploading(true);
    try {
      const ext = blob.type.includes('mp4') || blob.type.includes('m4a') || blob.type.includes('aac') ? 'm4a' : 'webm';
      const formData = new FormData();
      formData.append('file', blob, `voice-message.${ext}`);
      const res = await fetch(`${API_URL}/estate-chat/channels/${activeChannel.id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchMessages(activeChannel.id);
        await fetchChannels();
        const doScroll = () => { const sc = scrollContainerRef.current; if (sc) sc.scrollTop = sc.scrollHeight; };
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 250);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Voice upload failed:', res.status, errData);
      }
    } catch (err) { console.error('Voice send error:', err); } finally { setUploading(false); }
  };

  const stopAndPreview = async () => {
    const blob = await voiceRecorder.stop();
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVoicePreview({ blob, url });
    }
  };

  const discardPreview = () => {
    if (voicePreview) { URL.revokeObjectURL(voicePreview.url); setVoicePreview(null); }
  };

  return {
    uploading, setUploading,
    pendingFiles, setPendingFiles,
    voicePreview, setVoicePreview,
    uploadFile,
    uploadMultipleFiles,
    sendVoiceMessage,
    stopAndPreview,
    discardPreview,
  };
}
