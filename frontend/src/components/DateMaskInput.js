import React from 'react';
import { Input } from './ui/input';

/**
 * DateMaskInput — Custom masked date input component.
 * Replaces <input type="date"> to avoid Safari/iOS native rendering issues (clipping, inconsistent styling).
 * Accepts and emits dates in YYYY-MM-DD format internally, displays as MM/DD/YYYY.
 */
const DateMaskInput = ({ value, onChange, className, onFocus, ...props }) => {
  const toDisplay = (v) => {
    if (!v) return '';
    const parts = v.split('-');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
    return v;
  };

  const [display, setDisplay] = React.useState(toDisplay(value));

  React.useEffect(() => {
    setDisplay(toDisplay(value));
  }, [value]);

  const handleChange = (e) => {
    let raw = e.target.value.replace(/[^\d]/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);
    let formatted = '';
    if (raw.length > 0) formatted = raw.slice(0, 2);
    if (raw.length > 2) formatted += '/' + raw.slice(2, 4);
    if (raw.length > 4) formatted += '/' + raw.slice(4, 8);
    setDisplay(formatted);
    if (raw.length === 8) {
      const mm = raw.slice(0, 2), dd = raw.slice(2, 4), yyyy = raw.slice(4, 8);
      const m = parseInt(mm), d = parseInt(dd), y = parseInt(yyyy);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
        onChange({ target: { value: `${yyyy}-${mm}-${dd}` } });
      }
    } else {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder="MM/DD/YYYY"
      value={display}
      onChange={handleChange}
      onFocus={onFocus}
      className={className}
      maxLength={10}
      data-testid={props['data-testid'] || 'date-mask-input'}
      {...props}
    />
  );
};

export default DateMaskInput;
