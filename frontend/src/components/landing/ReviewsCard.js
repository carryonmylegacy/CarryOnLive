import React from 'react';
import { Star, ExternalLink, PenLine } from 'lucide-react';
import { useFounder } from './FounderCard';
import { useCopy } from '../../copy/CopyContext';

// Trustpilot "write a review" page for a profile URL like https://www.trustpilot.com/review/carryon.us
export const trustpilotWriteUrl = (url) => url.replace('/review/', '/evaluate/');

// Third-party review card (D3.5). Renders nothing until the founder sets the Trustpilot profile URL in Site Content.
export const ReviewsCard = ({ testIdSuffix = '' }) => {
  const { trustpilot_url: url } = useFounder();
  const { t } = useCopy();
  if (!url) return null;
  return (
    <div className="rounded-xl p-6 flex flex-col sm:flex-row sm:items-center gap-5" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(0,182,122,0.35)' }} data-testid={`reviews-card${testIdSuffix}`}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,182,122,0.14)', border: '1px solid rgba(0,182,122,0.35)' }}>
        <Star className="w-6 h-6 text-[#00b67a]" fill="#00b67a" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#00b67a] text-xs font-bold uppercase tracking-wider mb-1">{t('home.trust.reviews.eyebrow')}</p>
        <h4 className="text-white text-base font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('home.trust.reviews.title')}</h4>
        <p className="text-[#8b97ab] text-sm leading-relaxed">{t('home.trust.reviews.text')}</p>
      </div>
      <div className="flex flex-col gap-2 flex-shrink-0 text-sm">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold" style={{ background: '#00b67a', color: '#0B1221' }} data-testid={`reviews-read${testIdSuffix}`}>{t('home.trust.reviews.read')} <ExternalLink className="w-3.5 h-3.5" /></a>
        <a href={trustpilotWriteUrl(url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-[#e2e8f0]" style={{ border: '1px solid rgba(255,255,255,0.16)' }} data-testid={`reviews-write${testIdSuffix}`}>{t('home.trust.reviews.write')} <PenLine className="w-3.5 h-3.5" /></a>
      </div>
    </div>
  );
};

export default ReviewsCard;
