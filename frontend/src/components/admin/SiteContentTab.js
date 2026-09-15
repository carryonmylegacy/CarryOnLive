import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Save, ExternalLink, Play, Loader2, MapPin, Monitor, Smartphone, User, Linkedin, Upload } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { formatPhoneUS } from '../../utils/phoneFormat';

export const SiteContentTab = ({ getAuthHeaders }) => {
  const [videoId, setVideoId] = useState('');
  const [savedVideoId, setSavedVideoId] = useState('');
  const [videoIdVertical, setVideoIdVertical] = useState('');
  const [savedVideoIdVertical, setSavedVideoIdVertical] = useState('');
  const [footerLine1, setFooterLine1] = useState('');
  const [footerLine2, setFooterLine2] = useState('');
  const [footerPhone, setFooterPhone] = useState('');
  const [savedFooter, setSavedFooter] = useState({ line1: '', line2: '', phone: '' });
  const [founderName, setFounderName] = useState('');
  const [founderTitle, setFounderTitle] = useState('');
  const [founderBio, setFounderBio] = useState('');
  const [founderPhotoUrl, setFounderPhotoUrl] = useState('');
  const [founderLinkedin, setFounderLinkedin] = useState('');
  const [savedFounder, setSavedFounder] = useState({ name: '', title: '', bio: '', photo: '', linkedin: '' });
  const [savingFounder, setSavingFounder] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const founderPhotoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/platform-settings`, getAuthHeaders());
        const id = res.data?.homepage_video_id || 'EhU-jojs1jk';
        setVideoId(id);
        setSavedVideoId(id);
        const idV = res.data?.homepage_video_id_vertical || '';
        setVideoIdVertical(idV);
        setSavedVideoIdVertical(idV);
        const l1 = res.data?.footer_address_line1 || '1550 Wilson Boulevard 7th Floor';
        const l2 = res.data?.footer_address_line2 || 'Arlington, VA 22209 U.S.A.';
        const ph = res.data?.footer_phone || '(703) 884-1527';
        setFooterLine1(l1);
        setFooterLine2(l2);
        setFooterPhone(ph);
        setSavedFooter({ line1: l1, line2: l2, phone: ph });
        const fn = res.data?.founder_name || '';
        const ft = res.data?.founder_title || '';
        const fb = res.data?.founder_bio || '';
        const fp = res.data?.founder_photo_url || '';
        const fl = res.data?.founder_linkedin_url || '';
        setFounderName(fn); setFounderTitle(ft); setFounderBio(fb);
        setFounderPhotoUrl(fp); setFounderLinkedin(fl);
        setSavedFounder({ name: fn, title: ft, bio: fb, photo: fp, linkedin: fl });
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetch();
  }, [getAuthHeaders]);

  // Extract video ID from various YouTube URL formats
  const parseVideoId = (input) => {
    if (!input) return '';
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    const pathMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[1];
    return trimmed;
  };

  const hasLandscapeChanges = parseVideoId(videoId) !== savedVideoId;
  const hasVerticalChanges = parseVideoId(videoIdVertical) !== savedVideoIdVertical;
  const hasVideoChanges = hasLandscapeChanges || hasVerticalChanges;

  const handleSave = async () => {
    const parsedLandscape = parseVideoId(videoId);
    if (!parsedLandscape) { toast.error('Please enter a valid Landscape YouTube video ID or URL'); return; }
    setSaving(true);
    try {
      const payload = { homepage_video_id: parsedLandscape };
      const parsedVertical = parseVideoId(videoIdVertical);
      payload.homepage_video_id_vertical = parsedVertical;
      await axios.put(`${API_URL}/admin/platform-settings`, payload, getAuthHeaders());
      setVideoId(parsedLandscape);
      setSavedVideoId(parsedLandscape);
      setVideoIdVertical(parsedVertical);
      setSavedVideoIdVertical(parsedVertical);
      toast.success('Homepage videos updated');
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const hasFooterChanges = footerLine1 !== savedFooter.line1 || footerLine2 !== savedFooter.line2 || footerPhone !== savedFooter.phone;

  const handleSaveFooter = async () => {
    setSavingFooter(true);
    try {
      await axios.put(`${API_URL}/admin/platform-settings`, {
        footer_address_line1: footerLine1.trim(),
        footer_address_line2: footerLine2.trim(),
        footer_phone: footerPhone.trim(),
      }, getAuthHeaders());
      const updated = { line1: footerLine1.trim(), line2: footerLine2.trim(), phone: footerPhone.trim() };
      setSavedFooter(updated);
      toast.success('Footer contact info updated');
    } catch { toast.error('Failed to save footer info'); }
    setSavingFooter(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--t4)]" /></div>;

  return (
    <div className="space-y-6 pt-4" data-testid="site-content-tab">
      <Card className="border-[var(--b)] bg-[var(--s)]">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-base font-bold text-[var(--t)]">Homepage Videos</h3>
          </div>
          <p className="text-sm text-[var(--t4)]">
            Two videos are embedded on the homepage: <strong>Landscape</strong> for desktop browsers and <strong>Vertical</strong> for mobile PWA.
            Videos should be set to <strong>Unlisted</strong> on YouTube so they only play on your site.
          </p>

          {/* Landscape Video */}
          <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }}>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[var(--gold)]" />
              <label className="text-sm font-bold text-[var(--t)]">Landscape (Desktop)</label>
            </div>
            <input
              type="text"
              value={videoId}
              onChange={e => setVideoId(e.target.value)}
              placeholder="e.g. dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--s)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
              data-testid="video-id-input"
            />
            {videoId && parseVideoId(videoId) !== videoId && (
              <p className="text-xs text-[var(--t4)]">Parsed ID: <span className="font-mono text-[var(--gold)]">{parseVideoId(videoId)}</span></p>
            )}
            {savedVideoId && (
              <div className="pt-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-[var(--t4)]">Preview</span>
                  <a href={`https://www.youtube.com/watch?v=${savedVideoId}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--t4)] hover:text-[var(--gold)] transition-colors">
                    <ExternalLink className="w-3 h-3" /> YouTube
                  </a>
                </div>
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.15)' }}>
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${savedVideoId}?rel=0&modestbranding=1`}
                      title="Landscape Video Preview"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="video-preview-landscape"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vertical Video */}
          <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }}>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[var(--gold)]" />
              <label className="text-sm font-bold text-[var(--t)]">Vertical (Mobile PWA)</label>
            </div>
            <input
              type="text"
              value={videoIdVertical}
              onChange={e => setVideoIdVertical(e.target.value)}
              placeholder="e.g. dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ"
              className="w-full px-3 py-2.5 rounded-lg bg-[var(--s)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
              data-testid="video-id-vertical-input"
            />
            {videoIdVertical && parseVideoId(videoIdVertical) !== videoIdVertical && (
              <p className="text-xs text-[var(--t4)]">Parsed ID: <span className="font-mono text-[var(--gold)]">{parseVideoId(videoIdVertical)}</span></p>
            )}
            {savedVideoIdVertical && (
              <div className="pt-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-[var(--t4)]">Preview</span>
                  <a href={`https://www.youtube.com/watch?v=${savedVideoIdVertical}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--t4)] hover:text-[var(--gold)] transition-colors">
                    <ExternalLink className="w-3 h-3" /> YouTube
                  </a>
                </div>
                <div className="relative rounded-xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(212,175,55,0.15)', maxWidth: '280px' }}>
                  <div style={{ position: 'relative', paddingBottom: '177.78%', height: 0 }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${savedVideoIdVertical}?rel=0&modestbranding=1`}
                      title="Vertical Video Preview"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="video-preview-vertical"
                    />
                  </div>
                </div>
              </div>
            )}
            {!savedVideoIdVertical && (
              <p className="text-xs text-[var(--t5)] italic">No vertical video set. Mobile PWA users will see the landscape video as fallback.</p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hasVideoChanges}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: hasVideoChanges ? 'var(--gold)' : 'var(--b2)', color: hasVideoChanges ? '#0F1629' : 'var(--t4)' }}
            data-testid="save-video-btn"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Videos
          </button>
        </CardContent>
      </Card>

      {/* Footer Contact Info */}
      <Card className="border-[var(--b)] bg-[var(--s)]">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-base font-bold text-[var(--t)]">Footer Contact Info</h3>
          </div>
          <p className="text-sm text-[var(--t4)]">
            Update the address and phone number displayed in the footer of the landing pages.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Address Line 1</label>
              <input type="text" value={footerLine1} onChange={e => setFooterLine1(e.target.value)}
                placeholder="e.g. 1550 Wilson Boulevard 7th Floor"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="footer-line1-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Address Line 2</label>
              <input type="text" value={footerLine2} onChange={e => setFooterLine2(e.target.value)}
                placeholder="e.g. Arlington, VA 22209 U.S.A."
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="footer-line2-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Phone Number</label>
              <input type="text" value={formatPhoneUS(footerPhone)} onChange={e => setFooterPhone(formatPhoneUS(e.target.value))}
                placeholder="e.g. (703) 884-1527"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="footer-phone-input" />
            </div>
          </div>
          <button onClick={handleSaveFooter} disabled={savingFooter || !hasFooterChanges}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: hasFooterChanges ? 'var(--gold)' : 'var(--b2)', color: hasFooterChanges ? '#0F1629' : 'var(--t4)' }}
            data-testid="save-footer-btn">
            {savingFooter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Footer Info
          </button>
        </CardContent>
      </Card>

      {/* Founder Profile */}
      <Card className="border-[var(--b)] bg-[var(--s)]">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-base font-bold text-[var(--t)]">Founder Profile</h3>
          </div>
          <p className="text-sm text-[var(--t4)]">
            Your name, photo, and LinkedIn appear on the About page and build trust with visitors.
          </p>

          {/* Photo upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {founderPhotoUrl ? (
                <img src={founderPhotoUrl} alt="Founder" className="w-20 h-20 rounded-full object-cover" style={{ border: '2px solid var(--gold)' }} data-testid="founder-photo-preview" />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '2px solid var(--b2)' }} data-testid="founder-photo-placeholder-admin">
                  {founderName ? founderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'FP'}
                </div>
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div>
              <input type="file" ref={founderPhotoRef} accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5 MB'); return; }
                setUploadingPhoto(true);
                try {
                  const form = new FormData();
                  form.append('file', file);
                  const res = await axios.post(`${API_URL}/admin/founder-photo`, form, {
                    headers: { ...getAuthHeaders().headers },
                  });
                  setFounderPhotoUrl(res.data.photo_url);
                  setSavedFounder(prev => ({ ...prev, photo: res.data.photo_url }));
                  toast.success('Photo uploaded');
                } catch { toast.error('Upload failed'); }
                setUploadingPhoto(false);
                e.target.value = '';
              }} data-testid="founder-photo-file-input" />
              <button onClick={() => founderPhotoRef.current?.click()} disabled={uploadingPhoto}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: 'var(--b)', border: '1px solid var(--b2)', color: 'var(--t)' }}
                data-testid="founder-photo-upload-btn">
                <Upload className="w-3.5 h-3.5" /> {founderPhotoUrl ? 'Change Photo' : 'Upload Photo'}
              </button>
              <p className="text-[10px] text-[var(--t5)] mt-1">JPG or PNG, max 5 MB</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Full Name</label>
              <input type="text" value={founderName} onChange={e => setFounderName(e.target.value)}
                placeholder="e.g. Barnet Harris"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="founder-name-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Title / Role</label>
              <input type="text" value={founderTitle} onChange={e => setFounderTitle(e.target.value)}
                placeholder="e.g. Founder & CEO · 24-Year U.S. Military Veteran"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="founder-title-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Bio</label>
              <textarea value={founderBio} onChange={e => setFounderBio(e.target.value)} rows={3}
                placeholder="Short bio for the About page..."
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)] resize-none"
                data-testid="founder-bio-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">
                <Linkedin className="w-3.5 h-3.5 inline mr-1" />LinkedIn URL
              </label>
              <input type="url" value={founderLinkedin} onChange={e => setFounderLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/your-profile"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="founder-linkedin-input" />
            </div>
          </div>

          <button onClick={async () => {
            setSavingFounder(true);
            try {
              await axios.put(`${API_URL}/admin/platform-settings`, {
                founder_name: founderName.trim(),
                founder_title: founderTitle.trim(),
                founder_bio: founderBio.trim(),
                founder_linkedin_url: founderLinkedin.trim(),
              }, getAuthHeaders());
              setSavedFounder(prev => ({ ...prev, name: founderName.trim(), title: founderTitle.trim(), bio: founderBio.trim(), linkedin: founderLinkedin.trim() }));
              toast.success('Founder profile updated');
            } catch { toast.error('Failed to save'); }
            setSavingFounder(false);
          }}
            disabled={savingFounder || (founderName === savedFounder.name && founderTitle === savedFounder.title && founderBio === savedFounder.bio && founderLinkedin === savedFounder.linkedin)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: (founderName !== savedFounder.name || founderTitle !== savedFounder.title || founderBio !== savedFounder.bio || founderLinkedin !== savedFounder.linkedin) ? 'var(--gold)' : 'var(--b2)', color: (founderName !== savedFounder.name || founderTitle !== savedFounder.title || founderBio !== savedFounder.bio || founderLinkedin !== savedFounder.linkedin) ? '#0F1629' : 'var(--t4)' }}
            data-testid="save-founder-btn">
            {savingFounder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Founder Profile
          </button>
        </CardContent>
      </Card>
    </div>
  );
};
