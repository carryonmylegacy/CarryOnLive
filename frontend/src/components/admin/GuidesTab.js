import React, { useEffect, useState } from 'react';
import { BookOpen, Rocket, EyeOff, ExternalLink, Type, Loader2, CheckCircle2, Eye } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';
import { useCopy } from '../../copy/CopyContext';
import { GUIDE_ARTICLES } from '../../copy/siteCopyGuides';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** Admin → Marketing → Guides: preview the five articles and flip the public launch switch. */
export const GuidesTab = ({ getAuthHeaders }) => {
  const { t, applyFlags } = useCopy();
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient.get(`${API_URL}/public/guides/status`).then(r => setStatus(r.data)).catch(() => toast.error('Could not load the guides status'));
  }, []);

  const setLaunched = async (launched) => {
    setBusy(true);
    try {
      const r = await apiClient.put(`${API_URL}/admin/guides/launch`, { launched }, getAuthHeaders());
      setStatus(r.data);
      applyFlags({ guides_launched: r.data.launched, guides_launched_at: r.data.launched_at });
      toast.success(launched ? 'Guides are live on the public site' : 'Guides section hidden again');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not update the guides section');
    }
    setBusy(false);
    setConfirming(false);
  };

  if (!status) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--t4)]" /></div>;
  const live = status.launched;

  return (
    <div className="space-y-4 pt-4" data-testid="guides-tab">
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--gold)]" />
          <h3 className="text-base font-bold text-[var(--t)]">Guides</h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded ml-auto" style={live ? { background: 'rgba(34,201,147,0.15)', color: '#22C993' } : { background: 'var(--b2)', color: 'var(--t4)' }} data-testid="guides-status">
            {live ? `Live since ${fmt(status.launched_at)}` : 'Not public'}
          </span>
        </div>
        <p className="text-sm text-[var(--t4)]">
          Five evergreen family-continuity articles are written and waiting at <span className="font-mono text-[var(--t3)]">/guides</span>. Until you launch, visitors who land there see a short "not open yet" note, search engines are told not to index it, and no footer link appears. You can read every article now — the preview banner shows only to staff.
        </p>
        <div className="rounded-lg p-4 space-y-2 text-sm" style={{ background: 'var(--b)', border: '1px solid var(--b2)' }}>
          <p className="font-bold text-[var(--t)]">What Launch does</p>
          <ul className="space-y-1 text-[var(--t4)]">
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#22C993] flex-shrink-0 mt-0.5" /> Opens <span className="font-mono text-[var(--t3)]">/guides</span> and all five articles to everyone, immediately — no deploy.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#22C993] flex-shrink-0 mt-0.5" /> Adds a Guides link to the site footers and turns on Article schema dated the moment you launch.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-[#22C993] flex-shrink-0 mt-0.5" /> Sitemap and pre-rendered HTML for crawlers are picked up at the next deploy — press <strong className="text-[var(--t)]">Redeploy</strong> in Vercel; no code change needed.</li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!live && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid="guides-launch">
              <Rocket className="w-4 h-4" /> Launch guides section
            </button>
          )}
          {!live && confirming && (
            <>
              <span className="text-sm font-bold text-[var(--t)]" data-testid="guides-launch-confirm-text">Make all five articles public now?</span>
              <button type="button" disabled={busy} onClick={() => setLaunched(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: 'var(--gold)', color: '#0F1629' }} data-testid="guides-launch-confirm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Yes, launch
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="px-3 py-2 rounded-lg text-sm font-bold text-[var(--t4)] hover:text-[var(--t)]" data-testid="guides-launch-cancel">Not yet</button>
            </>
          )}
          {live && (
            <button type="button" disabled={busy} onClick={() => setLaunched(false)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-[var(--t4)] hover:text-[#f59e0b] disabled:opacity-40" style={{ border: '1px solid var(--b2)' }} data-testid="guides-unpublish">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />} Hide the section again
            </button>
          )}
          <a href="/admin/site-copy" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-[var(--t4)] hover:text-[var(--gold)] ml-auto" data-testid="guides-edit-copy">
            <Type className="w-4 h-4" /> Edit the wording in Site Copy
          </a>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid="guides-list">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--b)' }}>
          <p className="text-sm font-bold text-[var(--t)]">The five articles</p>
          <a href="/guides" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--t4)] hover:text-[var(--gold)]" data-testid="guides-preview-index"><Eye className="w-3 h-3" /> Preview the index</a>
        </div>
        {GUIDE_ARTICLES.map((a, i) => (
          <div key={a.slug} className="px-4 py-3 flex items-start justify-between gap-4" style={{ borderTop: i ? '1px solid var(--b)' : 'none' }} data-testid={`guides-article-${i}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--t)] leading-snug">{t(`guides.${a.slug}.title`)}</p>
              <p className="text-xs text-[var(--t4)] mt-0.5 line-clamp-2">{t(`guides.${a.slug}.dek`)}</p>
              <p className="text-xs font-mono text-[var(--t5)] mt-1">/guides/{a.slug}</p>
            </div>
            <a href={`/guides/${a.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 flex-shrink-0 text-xs font-bold text-[var(--gold)] hover:underline" data-testid={`guides-preview-${i}`}>
              <ExternalLink className="w-3 h-3" /> Preview
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GuidesTab;
