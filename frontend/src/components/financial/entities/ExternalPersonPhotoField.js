import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Loader2, User as UserIcon, Check, X } from 'lucide-react';
import { API_URL } from '../../../config';
import { toast } from '../../../utils/toast';

// Circular crop frame dimensions. The dim mask covers the FRAME×FRAME
// square; the bright circular cut-out shows the visible region. The
// ring around the circle (FRAME/2 − CIRCLE_R wide) gives the user
// some "spillover" so they can see what's just outside the crop.
const FRAME = 220;
const CIRCLE_R = 96;

export default function ExternalPersonPhotoField({
  personId,
  currentUrl,
  getAuthHeaders,
  onUploaded,
}) {
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // ── Crop-mode state ─────────────────────────────────────────────────
  // Set when a fresh file is picked; the user pans inside the circle
  // and then taps "Save photo" to crop + upload.
  const [cropFile, setCropFile] = useState(null);
  const [cropUrl, setCropUrl] = useState(null);
  // Image render geometry (covers the FRAME at the chosen scale) —
  // computed on imgRef.onLoad once we know natural dimensions.
  const [imgGeom, setImgGeom] = useState(null);
  // Cumulative pan offset in frame pixels (clamped so the image
  // always covers the circle — no transparent gaps inside it).
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Final committed photo for display (lifetime of this panel only).
  const [committedPreview, setCommittedPreview] = useState(null);

  const displayUrl = committedPreview || currentUrl || null;
  const showFallback = !displayUrl || loadFailed;

  // Cleanup any object URLs we created so we don't leak.
  useEffect(() => () => {
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    if (committedPreview && committedPreview.startsWith('blob:')) URL.revokeObjectURL(committedPreview);
  }, [cropUrl, committedPreview]);

  const handlePick = () => fileRef.current?.click();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking same file twice still fires
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please pick an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10 MB).');
      return;
    }
    // Enter crop mode: stash the file + a fresh object URL for the
    // <img> in the cropper. Pan resets so the image starts centered.
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropFile(file);
    setCropUrl(URL.createObjectURL(file));
    setPan({ x: 0, y: 0 });
    setImgGeom(null);
  };

  // Compute initial "cover" geometry once the image loads.
  const onImgLoad = (ev) => {
    const w = ev.target.naturalWidth;
    const h = ev.target.naturalHeight;
    if (!w || !h) return;
    // Cover-fit to the FRAME (always at least one dimension equals FRAME,
    // the other ≥ FRAME). Guarantees the image fills the visible circle.
    const scale = Math.max(FRAME / w, FRAME / h);
    const renderW = w * scale;
    const renderH = h * scale;
    setImgGeom({
      w, h, scale, renderW, renderH,
      // Centered inside the FRAME by default.
      left: (FRAME - renderW) / 2,
      top: (FRAME - renderH) / 2,
    });
  };

  // Clamp a proposed pan offset so the image still covers the circle.
  const clampPan = (px, py, geom) => {
    if (!geom) return { x: 0, y: 0 };
    // Image's screen-space bounds at the proposed pan: (left + px) → (left + renderW + px)
    // The circle covers (FRAME/2 − R) → (FRAME/2 + R). Image must cover
    // those bounds → derive min/max pan.
    const minX = (FRAME / 2 + CIRCLE_R) - geom.left - geom.renderW;
    const maxX = (FRAME / 2 - CIRCLE_R) - geom.left;
    const minY = (FRAME / 2 + CIRCLE_R) - geom.top - geom.renderH;
    const maxY = (FRAME / 2 - CIRCLE_R) - geom.top;
    return {
      x: Math.min(maxX, Math.max(minX, px)),
      y: Math.min(maxY, Math.max(minY, py)),
    };
  };

  // ── Pointer-driven pan ──────────────────────────────────────────────
  const dragRef = useRef(null);
  const onPanStart = (e) => {
    if (!imgGeom) return;
    e.target.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      origX: pan.x, origY: pan.y,
    };
  };
  const onPanMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const nx = d.origX + (e.clientX - d.startX);
    const ny = d.origY + (e.clientY - d.startY);
    setPan(clampPan(nx, ny, imgGeom));
  };
  const onPanEnd = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
  };

  // ── Save (crop + upload) ────────────────────────────────────────────
  const handleSaveCrop = async () => {
    if (!cropFile || !cropUrl || !imgGeom || uploading) return;
    setUploading(true);
    try {
      // Compute the source rectangle (in the original image's pixel
      // space) that maps to the visible circle. Inverse of the render
      // transform: src = (frame_coord − img_left − pan) / scale.
      const visLeft = FRAME / 2 - CIRCLE_R;
      const visTop = FRAME / 2 - CIRCLE_R;
      const srcX = (visLeft - imgGeom.left - pan.x) / imgGeom.scale;
      const srcY = (visTop - imgGeom.top - pan.y) / imgGeom.scale;
      const srcSize = (CIRCLE_R * 2) / imgGeom.scale;

      const canvas = document.createElement('canvas');
      // Output a 400×400 square. The backend's upload_photo() will
      // resize/recompress to its own max_size=200, so this is just
      // about giving the server something clean to work with.
      const OUT = 400;
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Could not encode crop.');

      // Optimistic local preview using the cropped blob — survives
      // the round-trip even if the server URL hiccups on first read.
      const localPreviewUrl = URL.createObjectURL(blob);

      const form = new FormData();
      form.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      const headers = getAuthHeaders ? (getAuthHeaders().headers || {}) : {};
      const res = await axios.post(
        `${API_URL}/financial/external-people/${personId}/photo`,
        form,
        { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
      );
      const newUrl = res.data?.photo_url;
      toast.success('Photo updated.');

      // Tear down the cropper, swap in the cropped blob preview as
      // committed display. The blob URL is rock-solid; the server URL
      // is already in DB and will load on the next mount via currentUrl.
      URL.revokeObjectURL(cropUrl);
      setCropFile(null);
      setCropUrl(null);
      setImgGeom(null);
      setPan({ x: 0, y: 0 });
      setCommittedPreview(localPreviewUrl);
      setLoadFailed(false);
      onUploaded?.(newUrl);
    } catch (err) {
      toast.error(err?.response?.data?.detail || err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelCrop = () => {
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    setCropFile(null);
    setCropUrl(null);
    setImgGeom(null);
    setPan({ x: 0, y: 0 });
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (cropFile) {
    return (
      <div className="space-y-3" data-testid="external-person-photo-field">
        <div
          className="relative mx-auto rounded-md overflow-hidden select-none"
          style={{
            width: FRAME,
            height: FRAME,
            background: '#000',
            touchAction: 'none',
            cursor: dragRef.current ? 'grabbing' : 'grab',
          }}
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
          data-testid="external-person-photo-crop-frame"
        >
          {/* The image. Pointer events bubble through to the frame so
              the whole thing is one drag surface. */}
          <img
            ref={imgRef}
            src={cropUrl}
            alt=""
            draggable={false}
            onLoad={onImgLoad}
            style={{
              position: 'absolute',
              left: (imgGeom?.left || 0) + pan.x,
              top: (imgGeom?.top || 0) + pan.y,
              width: imgGeom?.renderW,
              height: imgGeom?.renderH,
              maxWidth: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          {/* Dim mask + bright circular cutout + gold ring. SVG mask
              is the cleanest way to get a "ring of darkness" outside
              a circle on iOS Safari (CSS clip-path with even-odd
              fill ironically renders inverted on some Safari builds). */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={FRAME}
            height={FRAME}
            viewBox={`0 0 ${FRAME} ${FRAME}`}
          >
            <defs>
              <mask id={`ext-photo-circle-mask-${personId}`}>
                <rect width="100%" height="100%" fill="white" />
                <circle cx={FRAME / 2} cy={FRAME / 2} r={CIRCLE_R} fill="black" />
              </mask>
            </defs>
            <rect
              width="100%" height="100%"
              fill="rgba(8,14,26,0.66)"
              mask={`url(#ext-photo-circle-mask-${personId})`}
            />
            <circle
              cx={FRAME / 2} cy={FRAME / 2} r={CIRCLE_R}
              fill="none" stroke="rgba(212,165,55,0.95)" strokeWidth="2"
            />
          </svg>
        </div>
        <p className="text-[11px] text-center text-[var(--t5)]">
          Drag to position the photo inside the circle.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={uploading || !imgGeom}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12px] font-bold transition-all"
            style={{
              background: 'var(--gold)',
              color: '#080e1a',
              opacity: uploading || !imgGeom ? 0.55 : 1,
            }}
            data-testid="external-person-photo-save"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {uploading ? 'Saving…' : 'Save photo'}
          </button>
          <button
            type="button"
            onClick={handleCancelCrop}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12px] font-bold transition-all"
            style={{
              background: 'transparent',
              color: 'var(--t3)',
              border: '1px solid var(--b)',
            }}
            data-testid="external-person-photo-cancel"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
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

  // Idle state — small avatar + Upload/Replace button.
  return (
    <div className="flex items-center gap-3" data-testid="external-person-photo-field">
      <div
        className="relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{
          background: 'rgba(212,165,55,0.10)',
          border: '2px solid rgba(212,165,55,0.45)',
        }}
      >
        {!showFallback ? (
          <img
            src={displayUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setLoadFailed(true)}
            onLoad={() => setLoadFailed(false)}
          />
        ) : (
          <UserIcon className="w-7 h-7 text-[var(--gold)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={handlePick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all"
          style={{
            background: 'rgba(212,165,55,0.10)',
            color: 'var(--gold)',
            border: '1px solid rgba(212,165,55,0.45)',
          }}
          data-testid="external-person-photo-upload"
        >
          <Camera className="w-3.5 h-3.5" />
          {displayUrl && !loadFailed ? 'Replace photo' : 'Upload photo'}
        </button>
        <div className="text-[11px] text-[var(--t5)] mt-1">
          Square JPEG / PNG up to 10&nbsp;MB. Drag to frame after picking.
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
