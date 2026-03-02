/**
 * Generate initials from a name, preserving common suffixes (II, III, Jr, Sr, etc.)
 * "Barnet Louis Harris II" → "BLH II"
 * "John Smith Jr." → "JS Jr."
 * "Jane Doe" → "JD"
 */
const SUFFIXES = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'Jr', 'Jr.', 'Sr', 'Sr.', 'Esq', 'Esq.'];

export function getInitials(name, maxLetters = 0) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const hasSuffix = parts.length > 1 && SUFFIXES.includes(last);
  const nameParts = hasSuffix ? parts.slice(0, -1) : parts;
  let initials = nameParts.map(n => n[0]).join('').toUpperCase();
  if (maxLetters > 0) initials = initials.slice(0, maxLetters);
  return hasSuffix ? initials + ' ' + last : initials;
}
