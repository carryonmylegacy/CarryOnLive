import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Play, Pause } from 'lucide-react';
import { API_URL } from '../../config';

/**
 * Inline audio player for voice messages in ECT chat.
 */
export default function VoiceMessagePlayer({ fileId }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('carryon_token');
    fetch(`${API_URL}/estate-chat/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); }
    else { audio.play().catch(() => {}); }
  };

  if (!blobUrl) return <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#d4af37' }} />;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 min-w-[180px]" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} data-testid="voice-player">
      <audio
        ref={audioRef}
        src={blobUrl}
        preload="auto"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && isFinite(d)) setAudioDuration(d);
        }}
        onDurationChange={() => {
          const d = audioRef.current?.duration;
          if (d && isFinite(d)) setAudioDuration(d);
        }}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && a.duration && isFinite(a.duration)) {
            setProgress((a.currentTime / a.duration) * 100);
            if (!audioDuration || !isFinite(audioDuration)) setAudioDuration(a.duration);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        onClick={togglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: 'rgba(var(--gold-rgb), 0.2)' }}
        data-testid="voice-play-btn"
      >
        {playing
          ? <Pause className="w-4 h-4" style={{ color: '#d4af37' }} />
          : <Play className="w-4 h-4 ml-0.5" style={{ color: '#d4af37' }} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--b)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: '#d4af37' }} />
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--t4)' }}>
          {formatTime(audioRef.current?.currentTime || 0)} / {formatTime(audioDuration)}
        </div>
      </div>
    </div>
  );
}
