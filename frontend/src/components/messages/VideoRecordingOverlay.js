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
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  if (!showRecordingOverlay) return null;

  // When offline the NetworkStatusBanner pushes content down AND the
  // mobile dock was sitting on top of the overlay because an ancestor
  // was creating a stacking context — so we both (a) render via portal
  // to escape every parent stacking context, (b) raise z-index above
  // the dock (z-50) and below the offline banner (z-[9999]), and
  // (c) reshape the record button into an oval pill that fits inside
  // a tighter vertical band while still staying clear of the dock.
  const DOCK_CLEARANCE = 96; // mobile dock is ~80px tall + bottom safe-area slack

  const overlay = (
    <div
      className="fixed inset-0 bg-black flex flex-col overflow-y-auto"
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

        {/* Tier C — Recording limits banner, always visible pre-record. */}
        {!isRecording && countdown === null && (
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

        {/* Top controls — close & flip */}
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
      </div>

      {/* Bottom controls — oval pill record button so it stays fully
          visible even when the offline banner pushes content down and
          the mobile dock sits right above the system home-indicator. */}
      <div
        className="flex-shrink-0 flex items-center justify-center py-5 px-6"
        style={{
          background: 'rgba(0,0,0,0.88)',
          paddingBottom: `calc(1.25rem + env(safe-area-inset-bottom, 0px) + ${DOCK_CLEARANCE}px)`,
        }}
      >
        {!isRecording && countdown === null ? (
          <button
            onClick={startRecording}
            className="rounded-full flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{
              minWidth: 160,
              height: 56,
              padding: '0 28px',
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              boxShadow: '0 4px 24px rgba(212,175,55,0.4)',
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
              minWidth: 160,
              height: 56,
              padding: '0 28px',
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
            style={{ minWidth: 160, height: 56, background: 'var(--b)' }}
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
