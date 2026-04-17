import React from 'react';
import { X, Camera, StopCircle, SwitchCamera } from 'lucide-react';

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
  if (!showRecordingOverlay) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-y-auto" data-testid="video-recording-overlay">
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

      {/* Bottom controls */}
      <div className="flex-shrink-0 flex items-center justify-center py-8 px-6" style={{ background: 'rgba(0,0,0,0.8)', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
        {!isRecording && countdown === null ? (
          <button
            onClick={startRecording}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', boxShadow: '0 4px 24px rgba(212,175,55,0.4)' }}
            data-testid="start-recording-btn"
          >
            <Camera className="w-8 h-8 text-[#080e1a]" />
          </button>
        ) : isRecording ? (
          <button
            onClick={stopRecording}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: '#ef4444', boxShadow: '0 4px 24px rgba(239,68,68,0.4)' }}
            data-testid="stop-recording-btn"
          >
            <StopCircle className="w-8 h-8 text-white" />
          </button>
        ) : (
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <span className="text-3xl font-bold text-white">{countdown}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoRecordingOverlay;
