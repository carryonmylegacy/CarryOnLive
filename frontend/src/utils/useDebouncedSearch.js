import { useState, useRef, useCallback } from 'react';

/**
 * Returns [debouncedValue, setValueImmediately, setValueDebounced]
 * - debouncedValue: the value after the delay
 * - setImmediate: for controlled input display (instant)
 * - setDebounced: triggers the filter after delay
 */
export const useDebouncedSearch = (initialValue = '', delayMs = 250) => {
  const [displayValue, setDisplayValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const timerRef = useRef(null);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setDisplayValue(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedValue(val), delayMs);
  }, [delayMs]);

  return { displayValue, debouncedValue, handleChange };
};
