/**
 * ExternalPersonPhotoField — small avatar-upload widget for an
 * external person (someone in the E&S who is NOT a beneficiary).
 *
 * Posts the picked image to:
 *   POST /api/financial/external-people/{personId}/photo
 * (multipart form-data, mirrors the beneficiary photo pipeline).
 *
 * Renders:
 *   • Round preview of the current photo (or placeholder initials).
 *   • "Upload photo" / "Replace" button that opens the native file picker.
 *   • Inline saving state.
 *
 * The widget is intentionally tiny and uncontrolled — it simply
 * fires `onUploaded(newUrl)` after a successful upload so the parent
 * can refetch / refresh its node state.
 */
import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Loader2, User as UserIcon } from 'lucide-react';
import { API_URL } from '../../../config';
import { toast } from '../../../utils/toast';

export default function ExternalPersonPhotoField({
  personId,
  currentUrl,
  getAuthHeaders,
  onUploaded,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const url = previewUrl || currentUrl || null;

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file twice still fires onChange
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please pick an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10 MB).');
      return;
    }
    // Show local preview immediately for instant feedback.
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const headers = getAuthHeaders ? (getAuthHeaders().headers || {}) : {};
      const res = await axios.post(
        `${API_URL}/financial/external-people/${personId}/photo`,
        form,
        { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
      );
      const newUrl = res.data?.photo_url;
      if (newUrl) setPreviewUrl(newUrl);
      toast.success('Photo updated.');
      onUploaded?.(newUrl);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed.');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3" data-testid="external-person-photo-field">
      <div
        className="relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{
          background: 'rgba(212,165,55,0.10)',
          border: '2px solid rgba(212,165,55,0.45)',
        }}
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <UserIcon className="w-7 h-7 text-[var(--gold)]" />
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <Loader2 className="w-4 h-4 text-[var(--gold)] animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all"
          style={{
            background: 'rgba(212,165,55,0.10)',
            color: 'var(--gold)',
            border: '1px solid rgba(212,165,55,0.45)',
            opacity: uploading ? 0.6 : 1,
          }}
          data-testid="external-person-photo-upload"
        >
          <Camera className="w-3.5 h-3.5" />
          {url ? 'Replace photo' : 'Upload photo'}
        </button>
        <div className="text-[11px] text-[var(--t5)] mt-1">
          Square JPEG / PNG up to 10&nbsp;MB. Cropped automatically.
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
        data-testid="external-person-photo-input"
      />
    </div>
  );
}
