/**
 * Format a phone number string to U.S. format: (XXX) XXX-XXXX
 * Strips all non-digit characters and the leading country code "1" if present.
 */
export function formatPhoneUS(value) {
  let digits = (value || '').replace(/\D/g, '');
  // Strip leading US country code "1" (from +1 prefix in stored values)
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Strip formatting and return raw digits for storage/API calls.
 */
export function stripPhone(value) {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 10);
}
