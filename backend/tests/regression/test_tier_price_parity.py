"""Tier price parity — every catalog tier must resolve to ITS OWN price at every stage.

Class of bug this guards: a tier exists in the catalog but is missing from a hardcoded
map/list downstream and silently falls through to a default (status.py plan_map 2026-08-31,
family_plan.py ben_plan_map 2026-09-07). Any tier that resolves to a default at any stage
fails here BY NAME.

Stages (per tier, benefactor + beneficiary equivalent):
  1. catalog        DEFAULT_PLANS / BENEFICIARY_PLANS / PLAN_ORDER agree with each other
  2. status.py      plan_map (AST) + live beneficiary_locked_tier resolution
  3. plans payload  GET /subscriptions/plans — the exact object the paywall card renders
  4. family plan    add-member quote (original_price, family_price) + FPO preview, 30 % / 50 %
  5. checkout       plan_id -> Stripe amount for monthly / quarterly / annual (Stripe stubbed)
  6. static maps    feature_gates.TIER_IDS, apple_webhook, admin valid_tiers, frontend
                    tier maps (FeatureGatesCard, UsersTab, SubscriptionManagement,
                    SubscriptionPaywall, LandingPricing, iap.js)

Known defects are marked xfail(strict=True) with a B-number and file:line; fixing one makes
its xfail XPASS-strict → remove the entry from KNOWN. Nothing else is tolerated.
DB stages run in a subprocess bound to a throwaway scratch database (DB_NAME override).
"""

import ast
import json
import os
import re
import subprocess
import sys
import uuid
import warnings
from pathlib import Path

import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND = "/app/backend"
FRONTEND = "/app/frontend/src"
sys.path.insert(0, BACKEND)
load_dotenv(os.path.join(BACKEND, ".env"))

with warnings.catch_warnings():
    # emergentintegrations (imported via routes.subscriptions) still uses pydantic v1 validators.
    warnings.simplefilter("ignore", DeprecationWarning)
    from routes.subscriptions.plans import BEN_PLAN_ORDER, BENEFICIARY_PLANS, DEFAULT_PLANS, PLAN_ORDER  # noqa: E402

TIERS = list(PLAN_ORDER)
BEN_TIERS = [f"ben_{t}" for t in TIERS]
PLAN = {p["id"]: p for p in DEFAULT_PLANS}
BEN_PLAN = {p["id"]: p for p in BENEFICIARY_PLANS}
BENEFACTOR_DISC, BENEFICIARY_DISC = 30, 50
PAID_TIERS = [t for t in TIERS if float(PLAN[t]["price"]) > 0]
PAID_BEN_TIERS = [b for b in BEN_TIERS if float(BEN_PLAN.get(b, {}).get("price", 0)) > 0]

# ---- known defects (stage, tier) -> reason. Remove an entry once the code is fixed. ----
KNOWN = {
    ("feature_gates.TIER_IDS", "seniors"): "B1 routes/feature_gates.py:118-128 TIER_IDS lacks seniors",
    (
        "plans_payload.tier_features",
        "seniors",
    ): "B1 tier_features built from TIER_IDS (status.py:38) — no seniors column",
    (
        "apple_webhook.APPLE_TO_PLAN",
        "ben_new_adult",
    ): "B2 routes/subscriptions/apple_webhook.py:25-72 lacks ben_new_adult",
    ("iap.js", "ben_new_adult"): "B2 frontend/src/services/iap.js lacks ben_new_adult products",
    ("admin.users.valid_tiers", "seniors"): "B3 routes/admin/users.py:362 valid_tiers lacks seniors",
    ("admin.bulk_ops.valid_tiers", "seniors"): "B3 routes/admin/bulk_ops.py:37 valid_tiers lacks seniors",
    ("FeatureGatesCard.TIER_LABELS", "seniors"): "B4 components/admin/FeatureGatesCard.js TIER_LABELS lacks seniors",
    ("FeatureGatesCard.TIER_COLORS", "seniors"): "B4 components/admin/FeatureGatesCard.js TIER_COLORS lacks seniors",
    ("UsersTab.options", "seniors"): "B4 components/admin/UsersTab.js:278-292 tier <select> lacks seniors",
    (
        "SubscriptionManagement.TIER_STYLES",
        "seniors",
    ): "B4 components/settings/SubscriptionManagement.js:20-36 lacks seniors",
    (
        "SubscriptionManagement.TIER_STYLES",
        "ben_seniors",
    ): "B4 components/settings/SubscriptionManagement.js:20-36 lacks ben_seniors",
    (
        "SubscriptionManagement.TIER_STYLES",
        "ben_new_adult",
    ): "B4 components/settings/SubscriptionManagement.js:20-36 lacks ben_new_adult",
    (
        "SubscriptionManagement.TIER_STYLES",
        "ben_enterprise",
    ): "B4 components/settings/SubscriptionManagement.js:20-36 lacks ben_enterprise",
}
for _b in BEN_TIERS:
    KNOWN[("checkout.beneficiary", _b)] = (
        "B5 routes/subscriptions/checkout.py:76-79 resolves settings['plans'] only → 400 Invalid plan for every ben_*"
    )


def tier_params(stage, tiers):
    out = []
    for t in tiers:
        reason = KNOWN.get((stage, t))
        marks = [pytest.mark.xfail(strict=True, reason=reason)] if reason else []
        out.append(pytest.param(t, id=t, marks=marks))
    return out


# ---------------------------------------------------------------- stage 1: catalog ----
def test_catalog_plan_order_matches_default_plans():
    assert set(PLAN_ORDER) == set(PLAN), f"PLAN_ORDER vs DEFAULT_PLANS drift: {set(PLAN_ORDER) ^ set(PLAN)}"
    assert set(BEN_PLAN_ORDER) == set(BEN_PLAN), (
        f"BEN_PLAN_ORDER vs BENEFICIARY_PLANS drift: {set(BEN_PLAN_ORDER) ^ set(BEN_PLAN)}"
    )


@pytest.mark.parametrize("tier", tier_params("catalog", TIERS))
def test_catalog_every_tier_has_matching_beneficiary_plan(tier):
    ben = f"ben_{tier}"
    assert ben in BEN_PLAN, f"{tier}: BENEFICIARY_PLANS has no {ben}"
    assert float(BEN_PLAN[ben]["price"]) == float(PLAN[tier]["ben_price"]), (
        f"{tier}: BENEFICIARY_PLANS[{ben}].price={BEN_PLAN[ben]['price']} != DEFAULT_PLANS[{tier}].ben_price={PLAN[tier]['ben_price']}"
    )


# ------------------------------------------------------------- stage 2: status.py map ----
def _status_plan_map():
    tree = ast.parse(Path(BACKEND, "routes/subscriptions/status.py").read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "plan_map" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("status.py: plan_map literal not found")


@pytest.mark.parametrize("tier", tier_params("status.plan_map", TIERS))
def test_status_plan_map_covers_tier(tier):
    m = _status_plan_map()
    assert m.get(tier) == f"ben_{tier}", f"{tier}: status.py plan_map -> {m.get(tier)!r} (falls through to ben_base)"


# ----------------------------------------------------------- stage 6a: backend statics ----
@pytest.mark.parametrize("tier", tier_params("feature_gates.TIER_IDS", TIERS))
def test_feature_gates_tier_ids_cover_tier(tier):
    from routes.feature_gates import TIER_IDS

    assert tier in TIER_IDS, (
        f"{tier}: feature_gates.TIER_IDS lacks it → is_feature_enabled_for_user() is False for every feature"
    )


def _apple_plan_ids():
    from routes.subscriptions.apple_webhook import APPLE_TO_PLAN

    return set(APPLE_TO_PLAN.values())


@pytest.mark.parametrize("tier", tier_params("apple_webhook.APPLE_TO_PLAN", PAID_TIERS + PAID_BEN_TIERS))
def test_apple_product_map_covers_paid_tier(tier):
    assert tier in _apple_plan_ids(), (
        f"{tier}: no App Store product maps to it → purchase logs 'unknown product', nothing activates"
    )


def _literal_list_after(path, marker):
    src = Path(BACKEND, path).read_text()
    i = src.find(marker)
    assert i >= 0, f"{path}: marker {marker!r} not found"
    return ast.literal_eval(src[src.find("[", i) : src.find("]", i) + 1])


@pytest.mark.parametrize("tier", tier_params("admin.users.valid_tiers", TIERS))
def test_admin_users_valid_tiers_cover_tier(tier):
    assert tier in _literal_list_after("routes/admin/users.py", "valid_tiers = ["), (
        f"{tier}: admin cannot assign this tier"
    )


@pytest.mark.parametrize("tier", tier_params("admin.bulk_ops.valid_tiers", TIERS))
def test_admin_bulk_ops_valid_tiers_cover_tier(tier):
    assert tier in _literal_list_after("routes/admin/bulk_ops.py", "valid_tiers = ["), (
        f"{tier}: bulk tier assignment rejects it"
    )


# ---------------------------------------------------------- stage 6b: frontend statics ----
def _js_object_keys(rel_path, const_name):
    src = Path(FRONTEND, rel_path).read_text()
    i = src.find(f"const {const_name}")
    assert i >= 0, f"{rel_path}: const {const_name} not found"
    body = src[i : src.find("\n};", i)]
    return set(re.findall(r"^\s*([a-z_]+)\s*:", body, re.M))


FRONTEND_MAPS = {
    "FeatureGatesCard.TIER_LABELS": ("components/admin/FeatureGatesCard.js", "TIER_LABELS", TIERS),
    "FeatureGatesCard.TIER_COLORS": ("components/admin/FeatureGatesCard.js", "TIER_COLORS", TIERS),
    "SubscriptionPaywall.TIER_ICONS": ("components/SubscriptionPaywall.js", "TIER_ICONS", TIERS),
    "SubscriptionPaywall.TIER_COLORS": ("components/SubscriptionPaywall.js", "TIER_COLORS", TIERS),
    "SubscriptionManagement.TIER_STYLES": (
        "components/settings/SubscriptionManagement.js",
        "TIER_STYLES",
        TIERS + BEN_TIERS,
    ),
    # Landing pricing lists consumer tiers only; enterprise is sold B2B and never rendered there.
    "LandingPricing.TIER_ICON": (
        "components/landing/LandingPricing.js",
        "TIER_ICON",
        [t for t in TIERS if t != "enterprise"],
    ),
    "LandingPricing.TIER_ACCENT": (
        "components/landing/LandingPricing.js",
        "TIER_ACCENT",
        [t for t in TIERS if t != "enterprise"],
    ),
}


@pytest.mark.parametrize(
    "stage,tier",
    [
        pytest.param(s, t.values[0], id=f"{s}-{t.values[0]}", marks=t.marks)
        for s, (_, _, ts) in FRONTEND_MAPS.items()
        for t in tier_params(s, ts)
    ],
)
def test_frontend_tier_map_covers_tier(stage, tier):
    rel, const, _ = FRONTEND_MAPS[stage]
    assert tier in _js_object_keys(rel, const), f"{tier}: {rel} {const} lacks it → falls to default styling/label"


@pytest.mark.parametrize("tier", tier_params("UsersTab.options", TIERS))
def test_users_tab_tier_select_covers_tier(tier):
    src = Path(FRONTEND, "components/admin/UsersTab.js").read_text()
    assert f'<option value="{tier}"' in src, f"{tier}: UsersTab tier <select> lacks it → admin cannot assign"


@pytest.mark.parametrize("tier", tier_params("iap.js", PAID_TIERS + PAID_BEN_TIERS))
def test_iap_products_cover_paid_tier(tier):
    src = Path(FRONTEND, "services/iap.js").read_text()
    assert re.search(rf"^\s*{tier}_monthly\s*:", src, re.M), (
        f"{tier}: iap.js has no App Store product → native paywall cannot sell it"
    )


# --------------------------------------------------------- DB-backed stages 2b/3/4/5 ----
@pytest.fixture(scope="module")
def world():
    url = os.environ.get("MONGO_URL")
    if not url:
        pytest.skip("no MONGO_URL")
    client = MongoClient(url, serverSelectionTimeoutMS=3000)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("database unreachable")
    name = f"scratch_tier_parity_{uuid.uuid4().hex[:8]}"
    env = {**os.environ, "DB_NAME": name}
    p = subprocess.run(
        [sys.executable, os.path.join(BACKEND, "tests/regression/_tier_parity_runner.py")],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    client.drop_database(name)
    assert p.returncode == 0, p.stdout[-2000:] + p.stderr[-4000:]
    line = next(ln for ln in p.stdout.splitlines() if ln.startswith("RESULT "))
    return json.loads(line[len("RESULT ") :])


def _close(a, b):
    return a is not None and b is not None and abs(float(a) - float(b)) <= 0.011


@pytest.mark.parametrize("tier", tier_params("status.locked_tier", TIERS))
def test_status_resolves_beneficiary_to_own_tier(world, tier):
    row = world["tiers"][tier]
    assert row["beneficiary_locked_tier"] == f"ben_{tier}", (
        f"{tier}: beneficiary_locked_tier={row['beneficiary_locked_tier']!r}"
    )
    assert row["beneficiary_synth_plan_id"] == f"ben_{tier}", (
        f"{tier}: synthesized subscription.plan_id={row['beneficiary_synth_plan_id']!r}"
    )
    assert row["benefactor_plan_id"] == tier


@pytest.mark.parametrize("tier", tier_params("plans_payload.prices", TIERS))
def test_plans_payload_prices_match_catalog(world, tier):
    payload = world["plans_payload"]
    plan = next((p for p in payload["plans"] if p["id"] == tier), None)
    ben = next((p for p in payload["beneficiary_plans"] if p["id"] == f"ben_{tier}"), None)
    assert plan and _close(plan["price"], PLAN[tier]["price"]), (
        f"{tier}: paywall card price {plan and plan.get('price')} != catalog {PLAN[tier]['price']}"
    )
    assert plan and _close(plan["ben_price"], PLAN[tier]["ben_price"]), f"{tier}: card ben_price mismatch"
    assert ben and _close(ben["price"], BEN_PLAN[f"ben_{tier}"]["price"]), f"{tier}: beneficiary card price mismatch"


@pytest.mark.parametrize("tier", tier_params("plans_payload.tier_features", TIERS))
def test_plans_payload_has_feature_column_for_tier(world, tier):
    assert tier in world["plans_payload"]["tier_features"], (
        f"{tier}: paywall card gets no feature list (tier_features has no {tier} key)"
    )


@pytest.mark.parametrize("tier", tier_params("family.benefactor", TIERS))
def test_family_plan_benefactor_quote(world, tier):
    m = world["tiers"][tier]["family_members"].get("benefactor")
    assert m, f"{tier}: add-member (benefactor) recorded no member row"
    price = float(PLAN[tier]["price"])
    assert _close(m["original_price"], price), f"{tier}: family original_price {m['original_price']} != catalog {price}"
    assert _close(m["family_price"], round(price * (1 - BENEFACTOR_DISC / 100), 2)), (
        f"{tier}: family_price {m['family_price']} != {price} less {BENEFACTOR_DISC}%"
    )
    pv = world["tiers"][tier]["preview_fpo"]
    assert _close(pv["current_price"], price) and _close(
        pv["family_price"], round(price * (1 - BENEFACTOR_DISC / 100), 2)
    ), f"{tier}: preview_family_savings FPO {pv}"


@pytest.mark.parametrize("tier", tier_params("family.beneficiary", TIERS))
def test_family_plan_beneficiary_quote(world, tier):
    m = world["tiers"][tier]["family_members"].get("beneficiary")
    assert m, f"{tier}: add-member (beneficiary) recorded no member row"
    ben_price = float(BEN_PLAN[f"ben_{tier}"]["price"])
    assert _close(m["original_price"], ben_price), (
        f"{tier}: beneficiary family original_price {m['original_price']} != catalog ben_{tier} {ben_price} (fell through to a default?)"
    )
    assert _close(m["family_price"], round(ben_price * (1 - BENEFICIARY_DISC / 100), 2)), (
        f"{tier}: beneficiary family_price {m['family_price']} != {ben_price} less {BENEFICIARY_DISC}%"
    )


def _expected_amount(plan, cycle):
    if float(plan["price"]) <= 0:
        return None  # free tier: checkout activates without Stripe
    if cycle == "annual":
        return round(float(plan["annual_price"]) * 12, 2)
    if cycle == "quarterly":
        return round(float(plan["quarterly_price"]) * 3, 2)
    return float(plan["price"])


@pytest.mark.parametrize("tier", tier_params("checkout.benefactor", TIERS))
def test_checkout_amount_matches_catalog_for_benefactor(world, tier):
    co = world["tiers"][tier]["checkout"]["benefactor"]
    for cycle in ("monthly", "quarterly", "annual"):
        exp = _expected_amount(PLAN[tier], cycle)
        got = co[cycle]
        assert "error" not in got, f"{tier}/{cycle}: checkout rejected own catalog plan: {got['error']}"
        assert (got["amount"] is None and exp is None) or _close(got["amount"], exp), (
            f"{tier}/{cycle}: Stripe amount {got['amount']} != {exp}"
        )


@pytest.mark.parametrize("tier", tier_params("checkout.beneficiary", BEN_TIERS))
def test_checkout_amount_matches_catalog_for_beneficiary(world, tier):
    co = world["tiers"][tier[len("ben_") :]]["checkout"]["beneficiary"]
    for cycle in ("monthly", "quarterly", "annual"):
        exp = _expected_amount(BEN_PLAN[tier], cycle)
        got = co[cycle]
        assert "error" not in got, f"{tier}/{cycle}: checkout rejected own catalog plan: {got['error']}"
        assert (got["amount"] is None and exp is None) or _close(got["amount"], exp), (
            f"{tier}/{cycle}: Stripe amount {got['amount']} != {exp}"
        )
