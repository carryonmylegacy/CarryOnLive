import { useState } from 'react';
import { Play } from 'lucide-react';

/* Click-to-load YouTube facade — the real player (and its ~1MB of scripts)
   loads only after the visitor presses play.

   Poster: YouTube answers a missing thumbnail with a 120×90 grey placeholder
   *image* (HTTP 404 body the browser still renders), so `onError` never fires.
   We walk a candidate ladder and skip anything that decodes ≤120px wide.
   Vertical videos get the true 9:16 frame (`oar2`) first — `maxresdefault`
   is a pillarboxed 16:9 for those. */
const posterLadder = (videoId, vertical) => {
  const base = `https://i.ytimg.com/vi/${videoId}/`;
  const names = vertical
    ? ['oar2', 'oardefault', 'maxresdefault', 'sddefault', 'hqdefault']
    : ['maxresdefault', 'sddefault', 'hqdefault'];
  return names.map(n => `${base}${n}.jpg`);
};

export const YouTubeFacade = ({ videoId, title, testId, vertical = false, poster }) => {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const ladder = poster ? [poster, ...posterLadder(videoId, vertical)] : posterLadder(videoId, vertical);
  const thumb = ladder[Math.min(step, ladder.length - 1)];
  const next = () => setStep(s => (s + 1 < ladder.length ? s + 1 : s));

  if (playing) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&color=white&autoplay=1`}
        title={title}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        data-testid={`${testId}-player`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      data-testid={testId}
      className="group"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0, padding: 0, cursor: 'pointer', background: 'var(--bg2)', display: 'block' }}
    >
      <img
        src={thumb}
        onError={next}
        onLoad={e => { if (e.currentTarget.naturalWidth <= 120) next(); }}
        alt=""
        loading="lazy"
        decoding="async"
        data-testid={`${testId}-poster`}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,18,33,0.1) 0%, rgba(11,18,33,0.35) 100%)' }} />
      <span
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:scale-110"
        style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 72, height: 72, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(11,18,33,0.75)', border: '2px solid rgba(212,175,55,0.85)',
          boxShadow: '0 4px 30px rgba(0,0,0,0.5), 0 0 24px rgba(212,175,55,0.25)',
        }}
      >
        <Play className="w-7 h-7" style={{ color: '#d4af37', fill: '#d4af37', marginLeft: 4 }} />
      </span>
    </button>
  );
};
