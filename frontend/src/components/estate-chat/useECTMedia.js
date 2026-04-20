/**
 * useECTMedia — manages file attachment uploads and voice recording.
 * All logic moved verbatim from EstateChatPage.js.
 */
import { useState } from 'react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

/**
 * When the user is offline (and the offline feature flag is on), route
 * chat attachments + voice messages through the pending uploads queue
 * instead of a direct POST. Returns true when queued so callers can
 * skip the normal post-upload refetch.
 */
async function _queueIfOffline({ file, activeChannel, filename }) {
  if (typeof navigator !== 'undefined' && navigator.onLine !== false) return false;
  try {
    const { getOfflineMode } = await import('../../offline/featureFlag');
    if (getOfflineMode() !== 'on') return false;
    const { addPendingUpload } = await import('../../offline/pendingUploadsRepo');
    await addPendingUpload({
      kind: 'chat_media',
      filename: filename || file.name || 'attachment',
      mime_type: file.type || 'application/octet-stream',
      blob: file,
      metadata: {
        channel_id: activeChannel.id,
        content_type: file.type || 'application/octet-stream',
        filename: filename || file.name || 'attachment',
      },
    });
    toast.success('Attachment queued — we\'ll send it when you reconnect.');
    return true;
  } catch (err) {
    console.warn('[offline] chat attachment queue skipped:', err);
    return false;
  }
}

export default function useECTMedia({ token, activeChannel, fetchMessages, fetchChannels, voiceRecorder, scrollContainerRef }) {
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [voicePreview, setVoicePreview] = useState(null); // {blob, url}

  const uploadFile = async (file) => {
    if (!activeChannel || !file) return;
    if (await _queueIfOffline({ file, activeChannel })) return;
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
    // Offline path: queue each file individually via the chunked uploader.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        const { getOfflineMode } = await import('../../offline/featureFlag');
        if (getOfflineMode() === 'on') {
          const { addPendingUpload } = await import('../../offline/pendingUploadsRepo');
          for (const { file } of fileList) {
            await addPendingUpload({
              kind: 'chat_media',
              filename: file.name || 'attachment',
              mime_type: file.type || 'application/octet-stream',
              blob: file,
              metadata: {
                channel_id: activeChannel.id,
                content_type: file.type || 'application/octet-stream',
                filename: file.name || 'attachment',
              },
            });
          }
          toast.success(`${fileList.length} attachment${fileList.length === 1 ? '' : 's'} queued — we'll send when you reconnect.`);
          return;
        }
      } catch (err) { console.warn('[offline] chat multi queue skipped:', err); }
    }
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
    const ext = blob.type.includes('mp4') || blob.type.includes('m4a') || blob.type.includes('aac') ? 'm4a' : 'webm';
    const filename = `voice-message.${ext}`;
    // Offline: queue the voice blob for chunked drain on reconnect.
    if (await _queueIfOffline({ file: blob, activeChannel, filename })) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, filename);
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
