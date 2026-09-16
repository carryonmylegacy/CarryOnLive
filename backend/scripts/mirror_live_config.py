"""Mirror the LIVE public subscription config into this environment's DB.

Copies from `GET {LIVE_API}/api/subscriptions/plans` (public, no auth):
  beta_mode · family_plan_enabled · family_*_discount_percent ·
  per-plan prices (price / launch_price / final_price / ben_price / cycle
  discount %) · beneficiary plan prices · feature gates (per tier).

Run:
    cd /app/backend && python scripts/mirror_live_config.py            # apply
    cd /app/backend && python scripts/mirror_live_config.py --check    # drift report only (exit 1 on drift)

Idempotent. Never touches users, subscriptions, or anything outside
`subscription_settings._id == "global"`.
"""

import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

LIVE_API = os.environ.get("LIVE_API_URL", "https://carryon-api-kacr.onrender.com")

PLAN_FIELDS = (
    "price",
    "launch_price",
    "final_price",
    "ben_price",
    "quarterly_discount_percent",
    "annual_discount_percent",
    "allows_billing_toggle",
    "features",
    "name",
)
TOP_FIELDS = (
    "beta_mode",
    "family_plan_enabled",
    "family_benefactor_discount_percent",
    "family_beneficiary_discount_percent",
)


def fetch_live() -> dict:
    with urllib.request.urlopen(f"{LIVE_API}/api/subscriptions/plans", timeout=60) as r:
        return json.load(r)


def gates_from_live(live: dict, label_to_key: dict) -> dict:
    """live tier_features = {tier: [{label, enabled}]} → {feature_key: {tier: bool}}."""
    gates: dict = {}
    for tier, feats in (live.get("tier_features") or {}).items():
        for f in feats:
            key = f.get("key") or label_to_key.get(f.get("label"))
            if not key:
                continue
            gates.setdefault(key, {})[tier] = bool(f.get("enabled"))
    return gates


async def main(check_only: bool) -> int:
    from config import db
    from routes.feature_gates import PLATFORM_FEATURES, get_feature_gates
    from routes.subscriptions.plans import get_subscription_settings

    live = fetch_live()
    label_to_key = {f["label"]: f["key"] for f in PLATFORM_FEATURES}
    live_gates = gates_from_live(live, label_to_key)

    local = await get_subscription_settings()
    local_gates = await get_feature_gates()

    drift = []
    set_ops: dict = {}

    for k in TOP_FIELDS:
        if k in live and local.get(k) != live[k]:
            drift.append(f"{k}: {local.get(k)!r} → {live[k]!r}")
            set_ops[k] = live[k]

    local_plans = {p["id"]: p for p in local.get("plans", [])}
    for lp in live.get("plans", []):
        sp = local_plans.get(lp["id"])
        if not sp:
            drift.append(f"plan {lp['id']}: missing locally (added)")
            local.setdefault("plans", []).append(lp)
            continue
        for f in PLAN_FIELDS:
            if f in lp and sp.get(f) != lp[f]:
                drift.append(f"plan {lp['id']}.{f}: {sp.get(f)!r} → {lp[f]!r}")
                sp[f] = lp[f]
    set_ops["plans"] = local.get("plans", [])

    local_ben = {p["id"]: p for p in local.get("beneficiary_plans", [])}
    for lp in live.get("beneficiary_plans", []):
        sp = local_ben.get(lp["id"])
        if not sp:
            drift.append(f"beneficiary plan {lp['id']}: missing locally (added)")
            local.setdefault("beneficiary_plans", []).append(lp)
            continue
        for f in ("price", "name", "quarterly_discount_percent", "annual_discount_percent"):
            if f in lp and sp.get(f) != lp[f]:
                drift.append(f"beneficiary plan {lp['id']}.{f}: {sp.get(f)!r} → {lp[f]!r}")
                sp[f] = lp[f]
    set_ops["beneficiary_plans"] = local.get("beneficiary_plans", [])

    merged_gates = json.loads(json.dumps(local_gates))
    for key, tiers in live_gates.items():
        for tier, enabled in tiers.items():
            if merged_gates.get(key, {}).get(tier) != enabled:
                drift.append(f"gate {key}.{tier}: {merged_gates.get(key, {}).get(tier)!r} → {enabled!r}")
                merged_gates.setdefault(key, {})[tier] = enabled
    set_ops["feature_gates"] = merged_gates

    if not drift:
        print("✅ No drift — preview config matches live.")
        return 0

    print(f"{'Would apply' if check_only else 'Applying'} {len(drift)} change(s):")
    for d in drift:
        print("  •", d)
    if check_only:
        return 1

    await db.subscription_settings.update_one({"_id": "global"}, {"$set": set_ops}, upsert=True)
    try:
        from services.hot_cache import invalidate_all_subscription_cache

        invalidate_all_subscription_cache()
    except Exception:
        pass
    print("✅ Mirrored live config into subscription_settings.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--check" in sys.argv)))
