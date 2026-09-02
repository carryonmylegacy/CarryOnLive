"""READ-ONLY production audit — Sep 1 2026. Run in the Render API shell from /app.
A) deletion_requests: every row, age, status, whether the account is test/demo or a real third party
B) OTP storage: row counts, created_at type (why the TTL never fires), plaintext-shaped codes (counts only)
C) transcript at-rest sample + decrypt round-trip (prints a 40-char preview — deliberate one-time exception)
Uses find/count only. Never writes.
"""

import asyncio
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.getcwd())
TESTY = re.compile(r"test|demo|smoke|e2e|probe|qa|example\.com|carryontest|carryon-test|mailinator|idor-|\+", re.I)
DEMO_EMAILS = {"info@carryon.us", "founder@carryon.us", "e2e@carryon.us"}


def _dt(v):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


async def main():
    from config import db
    from services.transcript_crypto import dec, salt_for

    now = datetime.now(timezone.utc)

    print("=== A) deletion_requests ===")
    rows = await db.deletion_requests.find({}, {"_id": 0}).sort("requested_at", 1).to_list(1000)
    print(f"total={len(rows)} by_status={ {s: sum(1 for r in rows if r.get('status') == s) for s in {r.get('status') for r in rows}} }")
    older = 0
    real = 0
    for r in rows:
        t = _dt(r.get("requested_at"))
        age = (now - t).days if t else None
        over = age is not None and age > 30
        older += over
        u = await db.users.find_one({"id": r.get("user_id")}, {"_id": 0, "role": 1, "email": 1, "is_e2e_account": 1})
        email = r.get("email") or (u or {}).get("email") or "?"
        testy = email in DEMO_EMAILS or bool(TESTY.search(email)) or bool((u or {}).get("is_e2e_account"))
        real += not testy
        n_est = await db.estates.count_documents({"owner_id": r.get("user_id")})
        print(
            f"  {str(r.get('requested_at'))[:10]} age={age}d {'>30d' if over else '    '} status={r.get('status')} "
            f"| {email} role={(u or {}).get('role', 'USER DELETED')} estates={n_est} "
            f"| {'TEST/DEMO' if testy else 'REAL THIRD PARTY'} | reason={str(r.get('reason') or '')[:40]!r}"
        )
    print(f"older_than_30_days={older} real_third_party={real}")

    print("\n=== B) OTP storage ===")
    for coll, code_field in (("otps", "otp"), ("otp_codes", "code"), ("sms_otp_verifications", "otp")):
        n = await db[coll].count_documents({})
        if not n:
            print(f"{coll}: 0 rows")
            continue
        sample = await db[coll].find({}, {"_id": 0}).sort("_id", 1).limit(500).to_list(500)
        str_dates = sum(1 for s in sample if isinstance(s.get("created_at"), str))
        plain_shaped = sum(1 for s in sample if re.fullmatch(r"\d{4,8}", str(s.get(code_field) or s.get("otp") or s.get("code") or "")))
        oldest = _dt(sample[0].get("created_at")) if sample else None
        idx = await db[coll].index_information()
        ttl = [(k, v.get("expireAfterSeconds")) for k, v in idx.items() if "expireAfterSeconds" in v]
        print(
            f"{coll}: rows={n} oldest={oldest.date() if oldest else '?'} ({(now - oldest).days if oldest else '?'}d) "
            f"created_at_is_string={str_dates}/{len(sample)} plaintext_shaped_codes={plain_shaped}/{len(sample)} ttl_index={ttl or 'NONE'}"
        )
    print(f"failed_logins rows={await db.failed_logins.count_documents({})} | webauthn_challenges rows={await db.webauthn_challenges.count_documents({})} "
          f"| client_errors rows={await db.client_errors.count_documents({})} | funnel_sessions rows={await db.funnel_sessions.count_documents({})} "
          f"| chunked_uploads rows={await db.chunked_uploads.count_documents({})}")

    print("\n=== C) transcript at-rest sample (40-char preview: one-time exception) ===")
    for coll, fields in (("chat_history", ("content",)), ("beneficiary_concierge_messages", ("question", "answer"))):
        c = db[coll]
        print(
            f"{coll}: total={await c.count_documents({})} enc_v1={await c.count_documents({'enc_v': 1})} "
            f"enc_v0={await c.count_documents({'enc_v': 0})} no_enc_v={await c.count_documents({'enc_v': {'$exists': False}})}"
        )
        proj = {"_id": 0, "user_id": 1, "estate_id": 1, "created_at": 1, **{f: 1 for f in fields}}
        for row in await c.find({"enc_v": 1}, proj).sort("created_at", -1).limit(5).to_list(5):
            salt = await salt_for(row.get("estate_id"))
            u = await db.users.find_one({"id": row.get("user_id")}, {"_id": 0, "email": 1})
            for f in fields:
                raw = row.get(f) or ""
                plain = dec(raw, salt, 1)
                ok = plain != raw and plain != "[encrypted]" and all(ch.isprintable() or ch in "\n\r\t" for ch in plain)
                print(f"  {str(row.get('created_at'))[:10]} {(u or {}).get('email', '?')} {f}: at_rest={raw[:24]!r}... decrypts_ok={ok} preview={plain[:40]!r}")
    print("\nREAD-ONLY — nothing was written.")


asyncio.run(main())
