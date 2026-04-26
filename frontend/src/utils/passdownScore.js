/**
 * Pass-down readiness score for any CFP record (Bill / Debt / Account / Asset).
 *
 * Mission: surface to the benefactor — at a glance, on every tile — how
 * much of the "pass-down knowledge" they've actually captured for this
 * record. Empty fields beyond name+amount are the silent killers of a
 * smooth beneficiary experience; this score is what nudges the user to
 * fill them.
 *
 * Score is 0–100, weighted toward the fields a beneficiary needs FIRST:
 *   • Contact (phone/website)               25
 *   • Account masked / login link           20
 *   • DAV credential link                   20
 *   • Beneficiary instructions (any of the
 *     three structured notes is enough)     20
 *   • Designation set (not the default)     15
 */

const RECORD_FIELD_MAP = {
  bill: {
    contactKeys: ['biller_phone', 'biller_website'],
    accountKey: 'account_number_masked',
  },
  debt: {
    contactKeys: ['lender_phone', 'lender_website'],
    accountKey: 'account_number_masked',
  },
  account: {
    contactKeys: ['institution_phone', 'institution_website'],
    accountKey: 'account_number_masked',
  },
  asset: {
    // Property doesn't have a phone/website pair — count description as
    // the "context" field that fills the same role for the beneficiary.
    contactKeys: ['description', 'location_address'],
    accountKey: 'serial_or_vin',
  },
};

export function computePassdownScore(record, kind = 'bill') {
  if (!record) return 0;
  const map = RECORD_FIELD_MAP[kind] || RECORD_FIELD_MAP.bill;
  let score = 0;

  // Contact — 25 (full credit if either present, 25 if both)
  const contactHits = map.contactKeys.filter(k => !!String(record[k] || '').trim()).length;
  if (contactHits >= 2) score += 25;
  else if (contactHits === 1) score += 15;

  // Account / serial — 20
  if (String(record[map.accountKey] || '').trim()) score += 20;

  // DAV link — 20
  if (record.dav_entry_id) score += 20;

  // Pass-down instructions — 20 (any of the three structured notes
  // counts; legacy free-form `notes` also qualifies so old data still
  // scores).
  const hasInstruction = !!(
    record.notes_first_action ||
    record.notes_gotchas ||
    record.notes_who_to_call ||
    record.notes
  );
  if (hasInstruction) score += 20;

  // Designation — 15 (anything beyond the implicit "all" default)
  const desig = record.designated_beneficiaries || [];
  if (Array.isArray(desig) && desig.length && !(desig.length === 1 && desig[0] === 'all')) {
    score += 15;
  }

  return Math.max(0, Math.min(100, score));
}

export function passdownColor(score) {
  if (score >= 80) return '#10b981'; // emerald — beneficiary-ready
  if (score >= 50) return '#f59e0b'; // amber — partial
  return '#ef4444';                   // red — incomplete
}

export function passdownLabel(score) {
  if (score >= 80) return 'Pass-down ready';
  if (score >= 50) return 'Partial';
  return 'Needs detail';
}
