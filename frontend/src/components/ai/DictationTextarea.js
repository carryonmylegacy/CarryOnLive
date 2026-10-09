import React, { useEffect, useRef } from 'react';
import { DictationMicButton } from './DictationMicButton';

/**
 * The "describe it" box every talk-to-fill surface shares: a borderless textarea that grows with what you
 * say, and the mic in its own row at the lower right — so neither typed text nor the example ever runs under it.
 */
export const DictationTextarea = ({ value, onChange, placeholder, minHeight = '7.5rem', keyterms, onState, ariaLabel, testId, micTestId, className = '', style }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.55)}px`;
  }, [value]);
  return (
    <div className={`ai-dictation-box ${className}`} style={style} data-testid={`${testId}-box`}>
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
        className="ai-builder-input" style={{ minHeight }} data-testid={testId} />
      <div className="flex items-center justify-end px-2 pb-2 pt-1">
        <DictationMicButton value={value} onText={onChange} keyterms={keyterms} onState={onState} testId={micTestId} className="shadow-sm" />
      </div>
    </div>
  );
};

export default DictationTextarea;
