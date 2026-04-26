/**
 * Shared helpers for the Financial Portal forms (Bill / Debt / Account / Asset).
 *
 *  parseMoney   — strip $ , and whitespace so users can paste "$1,200.50".
 *                 Returns {ok, value, raw}. `value` is a finite number or
 *                 null when the input is blank.
 *
 *  formatPydanticError — turn a FastAPI / Pydantic 422 detail array into a
 *                 single human-readable line ("amount: must be a valid
 *                 number") instead of letting "[object Object]" or a
 *                 generic fallback bubble to the user.
 */

export function parseMoney(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, value: null, raw: '' };
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!cleaned) return { ok: true, value: null, raw: '' };
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return { ok: false, value: null, raw: cleaned };
  return { ok: true, value: n, raw: cleaned };
}

export function parseInteger(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, value: null, raw: '' };
  const cleaned = s.replace(/[,\s]/g, '');
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n)) return { ok: false, value: null, raw: cleaned };
  return { ok: true, value: n, raw: cleaned };
}

export function formatPydanticError(err, fallback = 'Save failed') {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = Array.isArray(first.loc) ? first.loc.slice(-1)[0] : '';
    const msg = first.msg || fallback;
    return field ? `${field}: ${msg}` : msg;
  }
  if (typeof detail === 'string' && detail) return detail;
  return err?.message || fallback;
}
