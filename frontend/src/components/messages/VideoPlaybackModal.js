import React from 'react';
import { X, Play, Pause } from 'lucide-react';

/**
 * VideoPlaybackModal — fullscreen liquid-glass video player.
 *
 * The tile sizes itself to the video's true aspect ratio within the space
 * left after the fixed top/bottom nav bars + safe-area insets. The close
 * button hugs the tile's top-right corner (not the screen corner) so it
 * always looks anchored to the video — never clipped by the app chrome,
 * never floating in letterbox space.
 */
const VideoPlaybackModal = ({ url, onClose }) => {
  const videoRef = React.useRef(null);
  const [showControls, setShowControls] = React.useState(true);
  const [aspect, setAspect] = React.useState(16 / 9); // default until metadata loads
  const [isPaused, setIsPaused] = React.useState(false);
  const timerRef = React.useRef(null);

  const hideAfterDelay = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowControls(false), 2200);
  };

  React.useEffect(() => {
    hideAfterDelay();
    return () => clearTimeout(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc to close (desktop + iPad keyboard)
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleTap = (e) => {
    e.stopPropagation();
    if (showControls) {
      setShowControls(false);
      clearTimeout(timerRef.current);
    } else {
      setShowControls(true);
      hideAfterDelay();
    }
  };

  const togglePlay = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      hideAfterDelay();
    } else {
      v.pause();
      clearTimeout(timerRef.current);
      setShowControls(true);
    }
  };

  const handleLoadedMetadata = (e) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      setAspect(v.videoWidth / v.videoHeight);
    }
  };

  // Reserved space around the tile so it never collides with the app chrome.
  // Top: ~64px for the fixed CarryOn header + safe-area inset.
  // Bottom: ~72px for the bottom tab bar + safe-area inset.
  // Extra ~12px breathing room on each side for polish.
  const containerStyle = {
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
    paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
    paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        ...containerStyle,
      }}
      onClick={handleTap}
      data-testid="video-playback-modal"
    >
      {/* The tile: sized to the video's true aspect ratio, fills whatever
          dimension is the limiter. Rounded + shadowed for that iOS "card"
          feel. The close button is absolutely positioned relative to THIS
          element so it always hugs the visible video edge. */}
      <div
        className="relative"
        style={{
          aspectRatio: String(aspect),
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset',
          // These two make the wrapper correctly resolve with aspect-ratio
          // against BOTH min-axis constraints in mobile browsers.
          minWidth: 0,
          minHeight: 0,
        }}
        data-testid="video-tile"
      >
        <video
          ref={videoRef}
          src={url}
          playsInline
          autoPlay
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
          className="w-full h-full block"
          style={{ objectFit: 'contain', background: '#000' }}
          data-testid="video-playback-element"
        />

        {/* Auto-fading controls overlay, scoped to the tile */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none' }}
        >
          {/* Subtle gradient so the close button always reads against bright
              footage (sky, highlights, etc.) without dimming the video. */}
          <div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '96px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Liquid-glass close button — hugs the tile's upper-right corner */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close video"
            data-testid="video-playback-close"
            className="absolute flex items-center justify-center active:scale-95 transition-transform"
            style={{
              top: '12px',
              right: '12px',
              width: '36px',
              height: '36px',
              borderRadius: '9999px',
              background: 'rgba(20, 20, 22, 0.52)',
              backdropFilter: 'blur(18px) saturate(180%)',
              WebkitBackdropFilter: 'blur(18px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow:
                '0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <X className="w-[18px] h-[18px] text-white" strokeWidth={2.4} />
          </button>

          {/* Play/Pause center button — matching liquid-glass treatment */}
          <button
            onClick={togglePlay}
            aria-label={isPaused ? 'Play' : 'Pause'}
            data-testid="video-playback-toggle"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center active:scale-95 transition-transform"
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '9999px',
              background: 'rgba(20, 20, 22, 0.48)',
              backdropFilter: 'blur(22px) saturate(180%)',
              WebkitBackdropFilter: 'blur(22px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.16)',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            {isPaused ? (
              <Play className="w-8 h-8 text-white" style={{ marginLeft: 3 }} strokeWidth={2.2} />
            ) : (
              <Pause className="w-8 h-8 text-white" strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlaybackModal;
