import React, { useState } from 'react';
import { API_URL } from '../../config';
import {
  Star,
  Check,
  Loader2,
  ThumbsUp,
  ArrowUp,
} from 'lucide-react';

export default function CCPDebriefView({ activationId, planName, token, onComplete, onSkip }) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/ccp/debrief/${activationId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rating, went_well: wentWell, to_improve: toImprove }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(onComplete, 1500);
      }
    } catch {} finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div data-testid="ccp-debrief-success" className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(34,201,147,0.15)' }}>
          <Check className="w-8 h-8" style={{ color: '#22C993' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
          Debrief Saved
        </h2>
        <p className="text-sm" style={{ color: 'var(--t4)' }}>
          Great practice! Your feedback helps your family improve.
        </p>
      </div>
    );
  }

  const displayRating = hoverRating || rating;

  const ratingLabels = ['', 'Needs work', 'Room to grow', 'Good effort', 'Well done', 'Excellent'];

  return (
    <div data-testid="ccp-debrief-view" className="max-w-lg mx-auto px-4 py-6 pb-28 sm:pb-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(59,123,247,0.12)' }}>
          <ThumbsUp className="w-7 h-7" style={{ color: '#3B7BF7' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--t)', fontFamily: 'var(--sans)' }}>
          Drill Complete!
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--t4)' }}>
          How did <strong style={{ color: 'var(--t)' }}>{planName}</strong> go?
        </p>
      </div>

      {/* Star Rating */}
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--t4)' }}>
          Rate your drill
        </p>
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s}
              onClick={() => setRating(s)}
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-all active:scale-110 p-1"
              data-testid={`ccp-debrief-star-${s}`}
            >
              <Star
                className="w-10 h-10 transition-all"
                style={{
                  color: s <= displayRating ? '#d4af37' : 'var(--b)',
                  fill: s <= displayRating ? '#d4af37' : 'none',
                  filter: s <= displayRating ? 'drop-shadow(0 0 4px rgba(var(--gold-rgb), 0.3))' : 'none',
                }}
              />
            </button>
          ))}
        </div>
        {displayRating > 0 && (
          <p className="text-sm mt-2 font-semibold" style={{ color: '#d4af37' }}>
            {ratingLabels[displayRating]}
          </p>
        )}
      </div>

      {/* What went well */}
      <div>
        <label className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#22C993' }}>
          <ThumbsUp className="w-3.5 h-3.5" />
          What went well?
        </label>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="e.g., Everyone got to the meeting point quickly"
          rows={3}
          className="w-full rounded-xl px-3 py-3 text-sm resize-none"
          data-testid="ccp-debrief-went-well"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
        />
      </div>

      {/* What to improve */}
      <div>
        <label className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#F5A623' }}>
          <ArrowUp className="w-3.5 h-3.5" />
          What could improve?
        </label>
        <textarea
          value={toImprove}
          onChange={(e) => setToImprove(e.target.value)}
          placeholder="e.g., Need to add go-bag to the garage"
          rows={3}
          className="w-full rounded-xl px-3 py-3 text-sm resize-none"
          data-testid="ccp-debrief-to-improve"
          style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="w-full py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97]"
        data-testid="ccp-debrief-submit"
        style={{
          background: rating > 0 ? 'linear-gradient(135deg, #d4af37, #F0C95C)' : 'var(--s)',
          color: rating > 0 ? '#080e1a' : 'var(--t5)',
        }}
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save Debrief'}
      </button>

      {/* Skip */}
      <button
        onClick={onSkip}
        className="w-full py-2 text-xs font-medium"
        data-testid="ccp-debrief-skip"
        style={{ color: 'var(--t5)', background: 'transparent' }}
      >
        Skip — I'll do this later
      </button>
    </div>
  );
}
