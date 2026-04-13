import React from 'react';
import { X, Play, Pause } from 'lucide-react';

const VideoPlaybackModal = ({ url, onClose }) => {
  const videoRef = React.useRef(null);
  const [showControls, setShowControls] = React.useState(true);
  const timerRef = React.useRef(null);

  const hideAfterDelay = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowControls(false), 2000);
  };

  React.useEffect(() => {
    hideAfterDelay();
    return () => clearTimeout(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (v.paused) { v.play(); hideAfterDelay(); }
    else { v.pause(); setShowControls(true); clearTimeout(timerRef.current); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center overflow-hidden" onClick={handleTap}>
      <video
        ref={videoRef}
        src={url}
        playsInline
        autoPlay
        className="max-w-full max-h-full"
        style={{ objectFit: 'contain' }}
      />
      {/* Auto-fading controls overlay */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none' }}
      >
        {/* Close button - inside the video window */}
        <button onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', marginTop: 'env(safe-area-inset-top, 0px)' }}>
          <X className="w-5 h-5 text-white" />
        </button>
        {/* Play/Pause center button */}
        <button onClick={togglePlay}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          {videoRef.current?.paused !== false
            ? <Play className="w-8 h-8 text-white ml-1" />
            : <Pause className="w-8 h-8 text-white" />}
        </button>
      </div>
    </div>
  );
};

export default VideoPlaybackModal;
