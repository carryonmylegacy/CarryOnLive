import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, StopCircle, SwitchCamera, WifiOff } from 'lucide-react';

const VideoRecordingOverlay = ({
  videoRef,
  isRecording,
  countdown,
  facingMode,
  showRecordingOverlay,
  startRecording,
  stopRecording,
  releaseCamera,
  flipCamera,
}) => {
  // Tier C — show recording limits up-front and warn if offline with
  // a stricter cap so the user never records a 20-minute epic they
  // can't save.
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  // Track viewport orientation so we can reflow the controls when
  // the user rotates to landscape — the platform's primary mode is
  // portrait but the recorder needs to stay usable when filming
  // wide subjects (founder report May 3 2026: "everything gets
  // skewed off when I rotate to landscape"). We listen on both
  // resize and the orientation matchMedia change so this stays in
  // sync no matter how iOS reports the rotation.
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    const onResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  if (!showRecordingOverlay) return null;

  // When offline the NetworkStatusBanner pushes content down AND the
  // mobile dock was sitting on top of the overlay because an ancestor
  // was creating a stacking context — so we both (a) render via portal
  // to escape every parent stacking context, (b) raise z-index above
  // the dock (z-50) and below the offline banner (z-[9999]), and
  // (c) reshape the record button into an oval pill that fits inside
  // a tighter vertical band while still staying clear of the dock.
  // The recording overlay is fixed full-screen and visually covers the
  // mobile bottom dock, so we no longer reserve dock clearance below
  // the Record button. (Was 96px in portrait — produced a large empty
  // band beneath the button.)
  const DOCK_CLEARANCE = 0;

  const overlay = (
    <div
      className={`fixed inset-0 bg-black overflow-y-auto ${isLandscape ? 'flex flex-row' : 'flex flex-col'}`}
      style={{ zIndex: 9998 }}
      data-testid="video-recording-overlay"
    >
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
            <span className="text-8xl font-bold text-white animate-pulse" style={{ fontFamily: 'var(--sans)' }}>{countdown}</span>
          </div>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-bold">Recording</span>
          </div>
        )}

        {/* Tier C — Recording limits banner, always visible pre-record.
            Portrait only — in landscape we render the same info inside
            the right control bar where it doesn't overlap the camera. */}
        {!isRecording && countdown === null && !isLandscape && (
          <div
            className="absolute left-4 right-4"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
            data-testid="recording-limits-banner"
          >
            <div
              className="rounded-xl px-3 py-2 text-[12px]"
              style={{
                background: offline ? 'rgba(124,29,29,0.92)' : 'rgba(0,0,0,0.72)',
                color: '#FFF6E8',
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {offline ? (
                <>
                  <div className="flex items-center gap-2 font-bold mb-0.5">
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>You're offline — 5-minute limit</span>
                  </div>
                  <div style={{ opacity: 0.9 }}>
                    Your video will save to your device and upload when you reconnect.
                  </div>
                </>
              ) : (
                <div>
                  <span className="font-bold">Recording limits: </span>
                  30 min online · 5 min offline
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top controls — close & flip. Portrait only — in landscape
            these live inside the right control bar so they don't crowd
            the camera feed under the offline status banner. */}
        {!isLandscape && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <button
              onClick={() => { if (isRecording) stopRecording(); releaseCamera(); }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.7)' }}
              data-testid="recording-close-btn"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            {!isRecording && (
              <button
                onClick={flipCamera}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.7)' }}
                data-testid="camera-flip-btn"
              >
                <SwitchCamera className="w-7 h-7 text-white" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls bar — bottom in portrait, right side in landscape so
          the record/stop button stays large and tappable without
          covering the camera feed when the device is rotated. In
          landscape we use `justify-between` so close/flip sit at the
          top, the recording-limits info sits in the middle, and the
          Record button anchors at the bottom — eliminates the big
          empty band the user reported on the right side. */}
      <div
        className={`flex-shrink-0 flex ${isLandscape ? 'flex-col py-4 px-3 items-center justify-between' : 'py-5 px-6 items-center justify-center'}`}
        style={{
          background: 'rgba(0,0,0,0.88)',
          ...(isLandscape ? {
            paddingRight: `calc(0.75rem + env(safe-area-inset-right, 0px))`,
            paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
            paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
            minWidth: 148,
            maxWidth: 200,
          } : {
            paddingBottom: `calc(1.25rem + env(safe-area-inset-bottom, 0px) + ${DOCK_CLEARANCE}px)`,
          }),
        }}
      >
        {/* Landscape: top cluster — close + flip */}
        {isLandscape && (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => { if (isRecording) stopRecording(); releaseCamera(); }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              data-testid="recording-close-btn"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            {!isRecording && (
              <button
                onClick={flipCamera}
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                data-testid="camera-flip-btn"
              >
                <SwitchCamera className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        )}

        {/* Landscape: middle — recording-limits info card */}
        {isLandscape && !isRecording && countdown === null && (
          <div
            className="rounded-xl px-3 py-2 text-[11px] w-full"
            style={{
              background: offline ? 'rgba(124,29,29,0.92)' : 'rgba(255,255,255,0.06)',
              color: '#FFF6E8',
              border: offline ? '1px solid rgba(255,160,160,0.25)' : '1px solid rgba(255,255,255,0.08)',
              lineHeight: 1.35,
            }}
            data-testid="recording-limits-banner"
          >
            {offline ? (
              <>
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <WifiOff className="w-3 h-3" />
                  <span>Offline · 5 min limit</span>
                </div>
                <div style={{ opacity: 0.9 }}>
                  Saves to your device, uploads on reconnect.
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="font-bold mb-0.5">Limits</div>
                <div style={{ opacity: 0.85 }}>30 min online · 5 min offline</div>
              </div>
            )}
          </div>
        )}

        {!isRecording && countdown === null ? (
          <button
            onClick={startRecording}
            className="rounded-full flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{
              minWidth: isLandscape ? 132 : 160,
              height: 56,
              padding: '0 24px',
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              boxShadow: '0 4px 24px rgba(var(--gold-rgb), 0.4)',
            }}
            data-testid="start-recording-btn"
          >
            <Camera className="w-6 h-6 text-[#080e1a]" />
            <span className="font-bold text-[#080e1a] text-base" style={{ fontFamily: 'var(--sans)' }}>Record</span>
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="rounded-full flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{
              minWidth: isLandscape ? 132 : 160,
              height: 56,
              padding: '0 24px',
              background: '#ef4444',
              boxShadow: '0 4px 24px rgba(239,68,68,0.4)',
            }}
            data-testid="stop-recording-btn"
          >
            <StopCircle className="w-6 h-6 text-white" />
            <span className="font-bold text-white text-base" style={{ fontFamily: 'var(--sans)' }}>Stop</span>
          </button>
        ) : (
          <div
            className="rounded-full flex items-center justify-center"
            style={{ minWidth: isLandscape ? 132 : 160, height: 56, background: 'var(--b)' }}
          >
            <span className="text-3xl font-bold text-white">{countdown}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Portal to document.body so the overlay escapes any ancestor
  // stacking context (Radix SlidePanel, modal wrappers, transforms)
  // and reliably covers the mobile dock.
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
};

export default VideoRecordingOverlay;
