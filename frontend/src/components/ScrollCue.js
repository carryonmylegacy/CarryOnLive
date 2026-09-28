import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// "There's more below" affordance for a scroll container whose native
// scrollbar is hidden (iOS): a slim gold rail on the right that tracks the
// scroll position, plus a bouncing chevron pill over a fade at the bottom
// that disappears once the last field is in view.
export const ScrollCue = ({ containerRef, deps = [], label = 'More below', testId = 'scroll-cue' }) => {
  const [state, setState] = useState({ overflow: false, atBottom: true, top: 0, size: 100 });

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight - clientHeight > 8;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 8;
    const size = overflow ? Math.max(14, (clientHeight / scrollHeight) * 100) : 100;
    const top = overflow ? (scrollTop / (scrollHeight - clientHeight)) * (100 - size) : 0;
    setState({ overflow, atBottom, top, size });
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [containerRef, measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.overflow) return null;
  const nudge = () => containerRef.current?.scrollBy({ top: containerRef.current.clientHeight * 0.7, behavior: 'smooth' });

  return (
    <>
      <div className="absolute top-1 bottom-1 right-0 w-[3px] rounded-full pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.07)' }} data-testid={`${testId}-rail`}>
        <div className="absolute left-0 right-0 rounded-full"
          style={{ top: `${state.top}%`, height: `${state.size}%`, background: 'linear-gradient(180deg, #d4af37, #b8962e)', boxShadow: '0 0 6px rgba(212,175,55,0.5)' }} />
      </div>
      {!state.atBottom && (
        <div className="absolute inset-x-0 bottom-0 h-20 flex items-end justify-center pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(12,20,38,0) 0%, rgba(12,20,38,0.94) 75%)' }}>
          <button type="button" onClick={nudge}
            className="pointer-events-auto mb-1.5 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold scroll-cue-bounce"
            style={{ background: 'rgba(212,175,55,0.14)', border: '1px solid rgba(212,175,55,0.45)', color: '#e5c558' }}
            data-testid={`${testId}-more`}>
            {label} <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
