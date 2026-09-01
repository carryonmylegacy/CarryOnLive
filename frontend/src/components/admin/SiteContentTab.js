import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { Save, ExternalLink, Play, Loader2, MapPin, Monitor, Smartphone, Gift, User, Upload, Trash2 } from 'lucide-react';
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
  const [referralEnabled, setReferralEnabled] = useState(false);
  const [referralBusy, setReferralBusy] = useState(false);
  const [headshotExists, setHeadshotExists] = useState(true);
  const [headshotVersion, setHeadshotVersion] = useState(() => Date.now());
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await apiClient.get(`${API_URL}/admin/platform-settings`, getAuthHeaders());
        const id = res.data?.homepage_video_id || 'KlZ8egF_Nyw';
        setVideoId(id);
        setSavedVideoId(id);
        const idV = res.data?.homepage_video_id_vertical || '';
        setVideoIdVertical(idV);
        setSavedVideoIdVertical(idV);
        const l1 = res.data?.footer_address_line1 || '1550 Wilson Boulevard 7th Floor';
        const l2 = res.data?.footer_address_line2 || 'Arlington, VA 22209';
        const ph = res.data?.footer_phone || '(703) 889-0017';
        setFooterLine1(l1);
        setFooterLine2(l2);
        setFooterPhone(ph);
        setSavedFooter({ line1: l1, line2: l2, phone: ph });
        setReferralEnabled(Boolean(res.data?.referral_program_enabled));
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
      await apiClient.put(`${API_URL}/admin/platform-settings`, payload, getAuthHeaders());
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
      await apiClient.put(`${API_URL}/admin/platform-settings`, {
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

  const handleToggleReferral = async (next) => {
    setReferralBusy(true);
    try {
      await apiClient.put(
        `${API_URL}/admin/platform-settings`,
        { referral_program_enabled: next },
        getAuthHeaders()
      );
      setReferralEnabled(next);
      toast.success(next ? 'Referral program enabled' : 'Referral program disabled');
    } catch {
      toast.error('Failed to update referral program');
    }
    setReferralBusy(false);
  };

  const handleHeadshotUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image is too large (max 8 MB)');
      return;
    }
    setHeadshotBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiClient.post(`${API_URL}/admin/site-content/founder-headshot`, form, getAuthHeaders());
      setHeadshotVersion(Date.now());
      setHeadshotExists(true);
      toast.success('Founder headshot updated — live on the About page');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to upload headshot');
    }
    setHeadshotBusy(false);
  };

  const handleHeadshotRemove = async () => {
    if (!window.confirm('Remove the founder headshot? The About page will show the placeholder again.')) return;
    setHeadshotBusy(true);
    try {
      await apiClient.delete(`${API_URL}/admin/site-content/founder-headshot`, getAuthHeaders());
      setHeadshotExists(false);
      setHeadshotVersion(Date.now());
      toast.success('Founder headshot removed');
    } catch {
      toast.error('Failed to remove headshot');
    }
    setHeadshotBusy(false);
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
                <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)' }}>
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
                <div className="relative rounded-xl overflow-hidden mx-auto" style={{ border: '1px solid rgba(var(--gold-rgb), 0.15)', maxWidth: '280px' }}>
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

      {/* Founder Headshot */}
      <Card className="border-[var(--b)] bg-[var(--s)]">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-base font-bold text-[var(--t)]">Founder Headshot</h3>
          </div>
          <p className="text-sm text-[var(--t4)]">
            The photo shown in the <strong>Founder</strong> section of the public About page.
            Uploads are automatically cropped to a square and resized — a clear, well-lit photo
            works best. Until one is uploaded, the page shows a &ldquo;coming soon&rdquo; placeholder.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }}>
            {headshotExists ? (
              <img
                src={`${API_URL}/public/founder-headshot?v=${headshotVersion}`}
                alt="Current founder headshot"
                className="w-28 h-28 rounded-full object-cover flex-shrink-0"
                style={{ border: '2px solid rgba(212,175,55,0.4)' }}
                onError={() => setHeadshotExists(false)}
                data-testid="founder-headshot-preview"
              />
            ) : (
              <div
                className="w-28 h-28 rounded-full flex-shrink-0 flex items-center justify-center text-center text-[11px] leading-tight px-2"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px dashed rgba(212,175,55,0.35)', color: 'var(--t4)' }}
                data-testid="founder-headshot-empty"
              >
                No headshot uploaded yet
              </div>
            )}
            <div className="flex flex-col gap-2.5 w-full sm:w-auto">
              <label
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-all"
                style={{ background: 'var(--gold)', color: '#0F1629', opacity: headshotBusy ? 0.5 : 1, pointerEvents: headshotBusy ? 'none' : 'auto' }}
                data-testid="founder-headshot-upload-btn"
              >
                {headshotBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {headshotExists ? 'Replace Photo' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleHeadshotUpload}
                  className="hidden"
                  disabled={headshotBusy}
                  data-testid="founder-headshot-input"
                />
              </label>
              {headshotExists && (
                <button
                  onClick={handleHeadshotRemove}
                  disabled={headshotBusy}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: 'var(--b2)', color: 'var(--t3)' }}
                  data-testid="founder-headshot-remove-btn"
                >
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              )}
              <a
                href="/about"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs text-[var(--t4)] hover:text-[var(--gold)] transition-colors"
                data-testid="founder-headshot-view-about"
              >
                <ExternalLink className="w-3 h-3" /> View About page
              </a>
            </div>
          </div>
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
                placeholder="e.g. Arlington, VA 22209"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--b)] border border-[var(--b2)] text-[var(--t)] text-base focus:outline-none focus:border-[var(--gold)]"
                data-testid="footer-line2-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--t4)] block mb-1">Phone Number</label>
              <input type="text" value={formatPhoneUS(footerPhone)} onChange={e => setFooterPhone(formatPhoneUS(e.target.value))}
                placeholder="e.g. (703) 889-0017"
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

      {/* Referral Program Toggle */}
      <Card className="border-[var(--b)] bg-[var(--s)]">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-[var(--gold)]" />
            <h3 className="text-base font-bold text-[var(--t)]">Referral Program</h3>
          </div>
          <p className="text-sm text-[var(--t4)]">
            When enabled, every signed-in user gets a personal referral code. Successful referrals
            grant <strong>7 bonus trial days</strong> to both the referrer and the new member.
            Default: <strong>OFF</strong>. While off, all referral endpoints are inert and the
            in-app Referral tile in Settings is hidden.
          </p>
          <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }}>
            <div>
              <p className="text-sm font-bold text-[var(--t)]">
                Referral program is currently {referralEnabled ? 'ENABLED' : 'DISABLED'}
              </p>
              <p className="text-xs text-[var(--t4)] mt-1">
                Toggle to {referralEnabled ? 'turn off' : 'turn on'} the platform-wide referral system.
              </p>
            </div>
            <button
              onClick={() => handleToggleReferral(!referralEnabled)}
              disabled={referralBusy}
              role="switch"
              aria-checked={referralEnabled}
              data-testid="referral-program-toggle"
              className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50"
              style={{ background: referralEnabled ? 'var(--gold)' : 'var(--b2)' }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                style={{ transform: referralEnabled ? 'translateX(22px)' : 'translateX(4px)' }}
              />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
