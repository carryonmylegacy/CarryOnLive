import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Quote, BadgeCheck, ArrowRight } from 'lucide-react';
import { API_URL } from '../../config';

export const ROLE_LABELS = {
  benefactor: 'Set up a plan for their family',
  beneficiary: 'Family member with access',
  hospice_family: 'Hospice family',
  military: 'Military / veteran family',
  other: 'CarryOn member',
};

export const useTestimonials = (limit = 6) => {
  const [data, setData] = useState({ items: [], total: 0, loaded: false });
  useEffect(() => {
    axios.get(`${API_URL}/testimonials`, { params: { limit } })
      .then(r => setData({ ...r.data, loaded: true }))
      .catch(() => setData(d => ({ ...d, loaded: true })));
  }, [limit]);
  return data;
};

export const TestimonialCard = ({ t, testIdSuffix = '' }) => (
  <figure className="rounded-xl p-6 h-full flex flex-col" style={{ background: 'rgba(15,26,46,0.6)', border: '1px solid rgba(212,175,55,0.22)' }} data-testid={`testimonial-card${testIdSuffix}`}>
    <Quote className="w-5 h-5 text-[#d4af37] mb-3" />
    <blockquote className="text-[#e2e8f0] text-base leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</blockquote>
    <figcaption className="mt-5 pt-4 border-t border-white/5">
      <p className="text-white text-sm font-semibold flex items-center gap-1.5">
        {t.display_name}
        {t.verified_member && <span className="inline-flex items-center gap-1 text-[#10b981] text-xs font-medium" title="Email matches a CarryOn account"><BadgeCheck className="w-3.5 h-3.5" /> Verified member</span>}
      </p>
      <p className="text-[#8b97ab] text-xs">{[t.location, ROLE_LABELS[t.role] || ROLE_LABELS.other, t.member_since ? `Member since ${t.member_since}` : null].filter(Boolean).join(' \u00b7 ')}</p>
    </figcaption>
  </figure>
);

// Approved, real member stories. Shows the honest empty state until the first one is approved.
export const TestimonialsBlock = ({ testIdSuffix = '' }) => {
  const { items, total, loaded } = useTestimonials(6);
  if (!loaded) return null;
  if (total === 0) {
    return (
      <p className="text-center text-[#8b97ab] text-sm" data-testid={`testimonials-empty${testIdSuffix}`}>
        No published member stories yet &mdash; we only publish real ones, reviewed by the founder.{' '}
        <a href="/customers" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-4 inline-flex items-center gap-1" data-testid={`testimonials-customers-link${testIdSuffix}`}>Why, and how to share yours <ArrowRight className="w-3.5 h-3.5" /></a>
      </p>
    );
  }
  return (
    <div data-testid={`testimonials-block${testIdSuffix}`}>
      <h3 className="text-white text-xl sm:text-2xl font-bold text-center mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>From CarryOn families &mdash; in their own words</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map(t => <TestimonialCard key={t.id} t={t} testIdSuffix={testIdSuffix} />)}
      </div>
      <p className="text-center mt-6 text-sm">
        <a href="/customers" className="text-[#d4af37] hover:text-[#fcd34d] underline underline-offset-4 inline-flex items-center gap-1" data-testid={`testimonials-customers-link${testIdSuffix}`}>Read all {total} {total === 1 ? 'story' : 'stories'} <ArrowRight className="w-3.5 h-3.5" /></a>
      </p>
    </div>
  );
};

export default TestimonialsBlock;
