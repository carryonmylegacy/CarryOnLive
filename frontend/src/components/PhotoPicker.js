import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Camera, Upload, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { resolvePhotoUrl } from '../utils/photoUrl';

/**
 * Crop a circular area from an image and return a Blob.
 */
async function getCroppedBlob(imageSrc, crop) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve) => { img.onload = resolve; img.src = imageSrc; });

  const canvas = document.createElement('canvas');
  const size = Math.min(crop.width, crop.height);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(img, crop.x, crop.y, size, size, 0, 0, size, size);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
  });
}

export function PhotoPicker({ onPhotoSelected, currentPhoto, onRemove }) {
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImage(ev.target.result);
      setShowSourcePicker(false);
      setShowCropper(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 640 }
      });
      setCameraStream(stream);
      setShowCamera(true);
      setShowSourcePicker(false);
      // Wait for next render to attach stream
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch {
      // Camera not available, fall back to file picker
      fileInputRef.current?.click();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Stop camera
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setShowCamera(false);

    setRawImage(dataUrl);
    setShowCropper(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const cancelCamera = () => {
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setShowCamera(false);
  };

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropDone = async () => {
    if (!rawImage || !croppedAreaPixels) return;
    const blob = await getCroppedBlob(rawImage, croppedAreaPixels);
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    const previewUrl = URL.createObjectURL(blob);
    onPhotoSelected(file, previewUrl);
    setShowCropper(false);
    setRawImage(null);
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Avatar circle — click to open source picker */}
      <div
        className="relative cursor-pointer group/avatar"
        onClick={() => setShowSourcePicker(true)}
        role="button"
        tabIndex={0}
        aria-label="Choose profile photo"
        onKeyDown={(e) => { if (e.key === 'Enter') setShowSourcePicker(true); }}
        data-testid="photo-picker-trigger"
      >
        {currentPhoto ? (
          <>
            <img src={resolvePhotoUrl(currentPhoto)} alt="Profile" className="w-20 h-20 rounded-full object-cover" />
            {onRemove && (
              <button
                type="button"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs hover:bg-red-600 z-10"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                aria-label="Remove photo"
              >
                x
              </button>
            )}
          </>
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#1e293b] flex items-center justify-center">
            <Camera className="w-8 h-8 text-[#64748b]" />
          </div>
        )}
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
          <Camera className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Source Picker Dialog */}
      <Dialog open={showSourcePicker} onOpenChange={setShowSourcePicker}>
        <DialogContent className="sm:max-w-xs bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add Photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 border-[#1e3a5f] hover:bg-[#1e293b]"
              onClick={startCamera}
              data-testid="photo-source-camera"
            >
              <Camera className="w-5 h-5 text-blue-400" />
              Take Photo
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 border-[#1e3a5f] hover:bg-[#1e293b]"
              onClick={() => { setShowSourcePicker(false); fileInputRef.current?.click(); }}
              data-testid="photo-source-library"
            >
              <Upload className="w-5 h-5 text-green-400" />
              Choose from Library
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => { if (!open) cancelCamera(); }}>
        <DialogContent className="sm:max-w-md bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] p-0 overflow-hidden">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-square object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-center gap-4 bg-gradient-to-t from-black/80">
              <Button variant="outline" onClick={cancelCamera} className="border-white/30">
                Cancel
              </Button>
              <Button
                onClick={capturePhoto}
                className="bg-white text-black hover:bg-gray-200 rounded-full w-16 h-16"
                data-testid="camera-capture-btn"
                aria-label="Capture photo"
              >
                <Camera className="w-6 h-6" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop/Zoom Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="sm:max-w-lg bg-[var(--bg2)] border-[var(--b)] text-[var(--t)] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Crop & Zoom</DialogTitle>
          </DialogHeader>

          <div className="relative w-full aspect-square bg-black">
            {rawImage && (
              <Cropper
                image={rawImage}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          {/* Controls */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-[#64748b]" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-blue-500"
                aria-label="Zoom level"
              />
              <ZoomIn className="w-4 h-4 text-[#64748b]" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                aria-label="Rotate photo"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-[#1e3a5f]"
                onClick={() => { setShowCropper(false); setRawImage(null); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleCropDone}
                data-testid="crop-done-btn"
              >
                Use Photo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
