import React from 'react';
import { X, Download } from 'lucide-react';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

/**
 * Fullscreen photo preview modal for ECT chat images.
 * Relies on previewGuardRef in EstateChatPage to block phantom iOS
 * touch events after this modal unmounts — no internal closing animation needed.
 */
export default function ImagePreviewModal({ previewImage, onClose }) {
  if (!previewImage) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<span style="opacity:0.6">Saving...</span>';
    btn.disabled = true;
    try {
      const token = localStorage.getItem('carryon_token');
      const fileId = previewImage.fileId;
      let blob;
      if (fileId) {
        const resp = await fetch(`${API_URL}/estate-chat/files/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        blob = await resp.blob();
      } else {
        const resp = await fetch(previewImage.src);
        blob = await resp.blob();
      }
      const ext = (previewImage.name || '').split('.').pop()?.toLowerCase() || 'jpg';
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
      const mimeType = mimeMap[ext] || blob.type || 'image/jpeg';
      const file = new File([blob], previewImage.name || 'photo.jpg', { type: mimeType });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = previewImage.name || 'photo.jpg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('Could not save photo');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  };

  return (
    <div
      data-testid="photo-preview-overlay"
      onTouchStart={(e) => { e.stopPropagation(); }}
      onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleClose(); }}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleClose(); }}
      onMouseDown={(e) => { e.stopPropagation(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
        touchAction: 'none',
        pointerEvents: 'auto',
      }}
    >
      <button
        data-testid="photo-preview-close"
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        onTouchEnd={(e) => { e.stopPropagation(); }}
        style={{
          position: 'absolute', top: 'env(safe-area-inset-top, 12px)', right: 12,
          marginTop: 12, width: 40, height: 40, borderRadius: '50%',
          background: 'var(--b2)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 10000,
        }}
      >
        <X className="w-5 h-5" style={{ color: '#fff' }} />
      </button>
      <img
        src={previewImage.src}
        alt={previewImage.name}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '95vw', maxHeight: '85vh',
          objectFit: 'contain', borderRadius: 8,
        }}
      />
      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }} onTouchEnd={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
        <span className="text-sm" style={{ color: 'var(--t4)' }}>{previewImage.name}</span>
        <button
          data-testid="photo-preview-download"
          onClick={handleSave}
          onTouchEnd={(e) => { e.stopPropagation(); }}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(var(--gold-rgb), 0.15)', border: '1px solid rgba(var(--gold-rgb), 0.3)',
            color: '#d4af37', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Download className="w-4 h-4 inline mr-1" /> Save
        </button>
      </div>
    </div>
  );
}
