import React, { useEffect, useRef } from 'react';
import { DictationMicButton } from './DictationMicButton';

/**
 * The "describe it" box every talk-to-fill surface shares: a borderless textarea that grows with what you
 * say, the example rendered as a real wrapped element (Safari clips long native placeholders), and the mic
 * in its own row at the lower right — so neither typed text nor the example ever runs under it.
 */
export const DictationTextarea = ({ value, onChange, placeholder, minHeight = '7.5rem', keyterms, onState, ariaLabel, testId, micTestId, className = '', style }) => {
  const ref = useRef(null);
  const exRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = 'auto';
      const h = Math.max(el.scrollHeight, exRef.current?.offsetHeight || 0);
      el.style.height = `${Math.min(h, window.innerHeight * 0.55)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value, placeholder]);
  const exampleId = `${testId}-example`;
  return (
    <div className={`ai-dictation-box ${className}`} style={style} data-testid={`${testId}-box`}>
      <div className="ai-dictation-grid">
        <div ref={exRef} id={exampleId} className={`ai-dictation-example${value ? ' hidden' : ''}`} data-testid={exampleId}>{placeholder}</div>
        <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} aria-describedby={value ? undefined : exampleId}
          className="ai-builder-input" style={{ minHeight }} data-testid={testId} />
      </div>
      <div className="flex items-center justify-end px-2 pb-2 pt-1">
        <DictationMicButton value={value} onText={onChange} keyterms={keyterms} onState={onState} testId={micTestId} className="shadow-sm" />
      </div>
    </div>
  );
};

export default DictationTextarea;
