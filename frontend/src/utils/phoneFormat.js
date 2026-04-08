/**
 * Format a phone number string to U.S. format: (XXX) XXX-XXXX
 * Strips all non-digit characters, then applies the mask progressively.
 */
export function formatPhoneUS(value) {
  const digits = (value || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Strip formatting and return raw digits for storage/API calls.
 */
export function stripPhone(value) {
  return (value || '').replace(/\D/g, '').slice(0, 10);
}
