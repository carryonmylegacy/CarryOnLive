"""Signup / login burst load test (preview only — never point at production).

Fires N concurrent registrations, then N concurrent logins, while a "bystander"
probe hits GET /health/live every 50 ms to measure how badly the event loop
freezes for everyone else. Emails are suppressed via the platform
`signup_otp_disabled` toggle + per-user `otp_enabled=False`; everything the run
creates is deleted at the end (prefix `lt_<run>_`).

    python scripts/loadtest_signup.py --concurrency 50 --label before
    python scripts/loadtest_signup.py --concurrency 100 200 --label after
"""

import argparse
import asyncio
import json
import os
import secrets
import statistics
import sys
import time
from datetime import datetime, timezone

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

PASSWORD = "LoadTest1234"


def _pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    k = max(0, min(len(values) - 1, round(p / 100 * len(values)) - 1))
    return values[k]


def _summ(name, lat, codes):
    ok = sum(v for k, v in codes.items() if 200 <= k < 300)
    return {
        "endpoint": name,
        "n": len(lat),
        "ok": ok,
        "errors": {str(k): v for k, v in codes.items() if not (200 <= k < 300)},
        "p50_ms": round(statistics.median(lat) * 1000) if lat else 0,
        "p95_ms": round(_pct(lat, 95) * 1000),
        "p99_ms": round(_pct(lat, 99) * 1000),
        "max_ms": round(max(lat) * 1000) if lat else 0,
    }


async def _bystander(client, base, stop, lat):
    while not stop.is_set():
        t = time.perf_counter()
        try:
            await client.get(f"{base}/health/live", timeout=30)
        except Exception:
            pass
        lat.append(time.perf_counter() - t)
        await asyncio.sleep(0.05)


async def _burst(client, base, path, payloads):
    lat, codes = [], {}

    async def one(i, body):
        headers = {"X-Forwarded-For": f"10.{(i >> 16) & 255}.{(i >> 8) & 255}.{i & 255}"}
        t = time.perf_counter()
        try:
            r = await client.post(f"{base}{path}", json=body, headers=headers, timeout=120)
            code = r.status_code
        except Exception:
            code = 0
        lat.append(time.perf_counter() - t)
        codes[code] = codes.get(code, 0) + 1

    await asyncio.gather(*(one(i, b) for i, b in enumerate(payloads)))
    return lat, codes


async def run_level(base, n, run, db):
    prefix = f"lt_{run}_{n}_"
    reg_payloads = [
        {
            "email": f"{prefix}{i}@carryon-loadtest.example",
            "password": PASSWORD,
            "first_name": "Load",
            "last_name": f"Test{i}",
            "username": f"{prefix}{i}",
            "date_of_birth": "1975-06-15",
            "marital_status": "married",
            "role": "benefactor",
        }
        for i in range(n)
    ]
    login_payloads = [{"email": f"{prefix}{i}", "password": PASSWORD} for i in range(n)]

    limits = httpx.Limits(max_connections=n + 5, max_keepalive_connections=n + 5)
    async with httpx.AsyncClient(limits=limits) as client:
        out = {"concurrency": n}
        for label, path, payloads in (
            ("register", "/auth/register", reg_payloads),
            ("login", "/auth/login", login_payloads),
        ):
            if label == "login":
                await db.users.update_many(
                    {"username_lower": {"$regex": f"^{prefix}"}}, {"$set": {"otp_enabled": False}}
                )
            stop, by_lat = asyncio.Event(), []
            by_task = asyncio.create_task(_bystander(client, base, stop, by_lat))
            await asyncio.sleep(0.3)
            t0 = time.perf_counter()
            lat, codes = await _burst(client, base, path, payloads)
            wall = time.perf_counter() - t0
            stop.set()
            await by_task
            out[label] = _summ(label, lat, codes)
            out[label]["wall_s"] = round(wall, 1)
            out[label]["throughput_per_s"] = round(len(lat) / wall, 1) if wall else 0
            out[f"{label}_bystander"] = _summ("health/live during " + label, by_lat, {200: len(by_lat)})
        return out


async def cleanup(db, run):
    rx = {"$regex": f"^lt_{run}_"}
    users = await db.users.find({"username_lower": rx}, {"_id": 0, "id": 1}).to_list(10000)
    ids = [u["id"] for u in users]
    estates = await db.estates.find({"owner_id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(10000)
    eids = [e["id"] for e in estates]
    r = {
        "users": (await db.users.delete_many({"id": {"$in": ids}})).deleted_count,
        "estates": (await db.estates.delete_many({"id": {"$in": eids}})).deleted_count,
        "beneficiaries": (await db.beneficiaries.delete_many({"estate_id": {"$in": eids}})).deleted_count,
        "checklists": (await db.checklists.delete_many({"estate_id": {"$in": eids}})).deleted_count,
        "otps": (await db.otps.delete_many({"user_id": {"$in": ids}})).deleted_count,
        "failed_logins": (await db.failed_logins.delete_many({"email": rx})).deleted_count,
        "notifications": (await db.notifications.delete_many({"body": {"$regex": f"@lt_{run}_"}})).deleted_count,
        "audit": (await db.audit_trail.delete_many({"actor_email": rx})).deleted_count,
        "rate_limits": (await db.rate_limits.delete_many({"key": {"$regex": ":10\\."}})).deleted_count,
    }
    return r


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8001/api")
    ap.add_argument("--concurrency", nargs="+", type=int, default=[50])
    ap.add_argument("--label", default="run")
    ap.add_argument("--keep", action="store_true", help="skip cleanup")
    args = ap.parse_args()
    if "carryon-api" in args.base or "onrender" in args.base:
        sys.exit("refusing to load-test production")

    from motor.motor_asyncio import AsyncIOMotorClient

    mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    run = secrets.token_hex(3)
    prev = await db.platform_settings.find_one(
        {"_id": "global"}, {"signup_otp_disabled": 1, "signup_otp_disabled_at": 1}
    )
    await db.platform_settings.update_one(
        {"_id": "global"},
        {"$set": {"signup_otp_disabled": True, "signup_otp_disabled_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    results = []
    try:
        for n in args.concurrency:
            res = await run_level(args.base, n, run, db)
            results.append(res)
            print(json.dumps(res, indent=1))
            await asyncio.sleep(2)
    finally:
        restore = {
            "signup_otp_disabled": bool((prev or {}).get("signup_otp_disabled", False)),
            "signup_otp_disabled_at": (prev or {}).get("signup_otp_disabled_at"),
        }
        await db.platform_settings.update_one({"_id": "global"}, {"$set": restore})
        if not args.keep:
            print("cleanup:", json.dumps(await cleanup(db, run)))
    path = f"/app/test_reports/loadtest_{args.label}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"label": args.label, "base": args.base, "run": run, "results": results}, f, indent=1)
    print("saved", path)


if __name__ == "__main__":
    asyncio.run(main())
