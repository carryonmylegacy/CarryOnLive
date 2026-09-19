import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Linkedin, ArrowRight, Medal } from 'lucide-react';
import { API_URL } from '../../config';
import { useCopy } from '../../copy/CopyContext';

const DEFAULTS = { name: 'Barnet Harris', title: 'Founder & CEO \u00b7 24-Year U.S. Military Veteran' };
// Built-in founder LinkedIn (D3.3) — Admin → Marketing → Site Content overrides it when set.
export const FOUNDER_LINKEDIN_DEFAULT = 'https://linkedin.com/in/barnetharris';

// Always address the headshot through the site's own API base (the backend's
// self-reported host can be an internal ingress name); `v` busts the 5-min cache.
export const founderPhotoUrl = (d = {}) =>
  d.founder_photo_url ? `${API_URL}/public/founder-headshot?v=${encodeURIComponent(d.founder_photo_updated_at || '')}` : '';

export const useFounder = () => {
  const [founder, setFounder] = useState({ ...DEFAULTS, photo_url: '', linkedin_url: FOUNDER_LINKEDIN_DEFAULT, video_id: '', trustpilot_url: '' });
  useEffect(() => {
    axios.get(`${API_URL}/public/site-content`).then(r => {
      const d = r.data || {};
      setFounder({ name: d.founder_name || DEFAULTS.name, title: d.founder_title || DEFAULTS.title, photo_url: founderPhotoUrl(d), linkedin_url: d.founder_linkedin_url || FOUNDER_LINKEDIN_DEFAULT, video_id: d.homepage_video_id || '', trustpilot_url: d.trustpilot_url || '' });
    }).catch(() => {});
  }, []);
  return founder;
};

export const FounderCard = ({ testIdSuffix = '', compact = false }) => {
  const f = useFounder();
  const { flags } = useCopy();
  // Public founder story → straight to it; invite-only → the About page (which links to the request gate).
  const storyHref = flags.founder_story_public ? '/founder-about' : '/about';
  const initials = f.name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return (
    <div className={`rounded-xl ${compact ? 'p-5' : 'p-6'} flex gap-5 items-center`} style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid={`founder-card${testIdSuffix}`}>
      {f.photo_url ? (
        <img src={f.photo_url} alt={`${f.name}, ${f.title}`} className="w-20 h-20 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid rgba(212,175,55,0.5)' }} data-testid={`founder-photo${testIdSuffix}`} />
      ) : (
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '2px solid rgba(212,175,55,0.4)', fontFamily: 'Outfit, sans-serif' }} data-testid={`founder-initials${testIdSuffix}`}>{initials}</div>
      )}
      <div className="min-w-0">
        <p className="text-[#d4af37] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1"><Medal className="w-3.5 h-3.5" /> Founder-led</p>
        <p className="text-white text-lg font-bold leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid={`founder-name${testIdSuffix}`}>{f.name}</p>
        <p className="text-[#8b97ab] text-sm mb-2">{f.title}</p>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <a href={storyHref} className="text-[#d4af37] hover:text-[#fcd34d] inline-flex items-center gap-1 underline underline-offset-4" data-testid={`founder-about-link${testIdSuffix}`}>Read his story <ArrowRight className="w-3.5 h-3.5" /></a>
          {f.linkedin_url && (
            <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[#8b97ab] hover:text-white inline-flex items-center gap-1.5" data-testid={`founder-linkedin${testIdSuffix}`}><Linkedin className="w-4 h-4" /> LinkedIn</a>
          )}
        </div>
      </div>
    </div>
  );
};

export default FounderCard;
