/**
 * BeneficiariesPage — module-level constants.
 *
 * Extracted from BeneficiariesPage.js during Monolith Reduction 6/6 (Feb 2026).
 * Pure data: relation labels, avatar palette, succession labels/colors, and
 * US state codes. No React, no state.
 */

export const relations = [
  'Spouse', 'Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Mother', 'Father', 'Mother-in-law', 'Father-in-law', 'Brother', 'Sister', 'Aunt', 'Uncle', 'Grandson', 'Granddaughter', 'Grandmother', 'Grandfather', 'Nephew', 'Niece', 'Great-Grandson', 'Great-Granddaughter', 'Great-Grandmother', 'Great-Grandfather', 'Friend', 'Other',
];

export const avatarColors = [
  '#d4af37', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4',
];

// Succession hierarchy labels — position 0 = Primary, 1 = Secondary, etc.
export const SUCCESSION_LABELS = [
  'Primary', 'Secondary', 'Tertiary', 'Quaternary', 'Quinary',
  'Senary', 'Septenary', 'Octonary', 'Nonary', 'Denary',
];
export const getSuccessionLabel = (index) => SUCCESSION_LABELS[index] || `#${index + 1}`;
export const SUCCESSION_COLORS = {
  0: { bg: 'rgba(34,201,147,0.15)', color: '#22C993', border: '1px solid rgba(34,201,147,0.3)' },
  1: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' },
  2: { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' },
};

export const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];
