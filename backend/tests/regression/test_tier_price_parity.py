"""Tier price parity — every catalog tier must resolve to ITS OWN price at every stage.

Class of bug this guards: a tier exists in the catalog but is missing from a hardcoded
map/list downstream and silently falls through to a default (status.py plan_map 2026-08-31,
family_plan.py ben_plan_map 2026-09-07). Any tier that resolves to a default at any stage
fails here BY NAME.

Stages (per tier, benefactor + beneficiary equivalent):
  1. catalog        DEFAULT_PLANS / BENEFICIARY_PLANS / PLAN_ORDER agree with each other
  2. status.py      plan_map (AST) + live beneficiary_locked_tier + DOB eligibility
  3. plans payload  GET /subscriptions/plans — the exact object the paywall card renders
  4. family plan    add-member quote (original_price, family_price) + FPO/beneficiary preview
  5. checkout       plan_id -> Stripe amount for monthly / quarterly / annual (Stripe stubbed),
                    live + beta, change-plan (incl. per-user discount), change-billing
  6. static maps    feature_gates.TIER_IDS, apple_webhook, admin valid_tiers, frontend
                    tier maps, paywall copy, trial emails
  7. lifecycle      new_adult age-out, Apple IAP activation, admin beneficiary price edit
  8. baseline       every BENEFACTOR amount equals the frozen pre-fix fixture (byte-identical)

Known defects are marked xfail(strict=True) with a B/C-number and file:line; fixing one makes
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
BASELINE = Path(BACKEND, "tests/regression/fixtures/benefactor_billing_baseline.json")
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
ANY_PLAN = {**PLAN, **BEN_PLAN}
BENEFACTOR_DISC, BENEFICIARY_DISC, CUSTOM_DISCOUNT = 30, 50, 25
PAID_TIERS = [t for t in TIERS if float(PLAN[t]["price"]) > 0]
PAID_BEN_TIERS = [b for b in BEN_TIERS if float(BEN_PLAN.get(b, {}).get("price", 0)) > 0]
CYCLES = ("monthly", "quarterly", "annual")

# ---- known defects (stage, tier) -> reason. Empty: every catalog tier resolves to its own price
# at every stage. Add an entry ONLY while a defect is being fixed on the same branch. ----
KNOWN = {}


def tier_params(stage, tiers):
    out = []
    for t in tiers:
        reason = KNOWN.get((stage, t))
        marks = [pytest.mark.xfail(strict=True, reason=reason)] if reason else []
        out.append(pytest.param(t, id=t, marks=marks))
    return out


def _close(a, b):
    return a is not None and b is not None and abs(float(a) - float(b)) <= 0.011


def _cycle_total(plan, cycle, discount=0):
    """Full-period charge for a plan/cycle — same rule as /subscriptions/checkout."""
    if float(plan["price"]) <= 0:
        return None  # free tier: activates without Stripe
    if cycle == "annual":
        amount = round(float(plan["annual_price"]) * 12, 2)
    elif cycle == "quarterly":
        amount = round(float(plan["quarterly_price"]) * 3, 2)
    else:
        amount = float(plan["price"])
    return round(amount * (1 - discount / 100), 2) if discount else amount


def _assert_amounts(got_by_cycle, plan, label, discount=0, cycles=CYCLES):
    for cycle in cycles:
        exp = _cycle_total(plan, cycle, discount)
        got = got_by_cycle[cycle]
        assert "error" not in got, f"{label}/{cycle}: rejected own catalog plan: {got['error']}"
        if exp is None:
            assert not got["amount"], f"{label}/{cycle}: free tier charged {got['amount']}"
        else:
            assert _close(got["amount"], exp), f"{label}/{cycle}: amount {got['amount']} != {exp}"


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


@pytest.mark.parametrize("tier", tier_params("feature_gates.unknown_tier", ["unknown"]))
def test_feature_gates_unknown_tier_is_denied_everywhere(tier):
    from routes.feature_gates import _build_default_gates, get_enabled_features_for_tier

    gates = _build_default_gates()
    assert get_enabled_features_for_tier(gates, "no_such_tier") == [], (
        "get_enabled_features_for_tier shows every feature for an unknown tier while is_feature_enabled_for_user denies it"
    )
    assert get_enabled_features_for_tier(gates, "ben_premium") == get_enabled_features_for_tier(gates, "premium"), (
        "ben_<tier> must inherit <tier>'s gates (a beneficiary on their own ben_* sub must not lose navigation)"
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


def _starting_monthly_price():
    """Lowest paid, no-verification benefactor price — what 'Plans start at' must quote."""
    return min(float(p["price"]) for p in DEFAULT_PLANS if float(p["price"]) > 0 and not p.get("requires_verification"))


@pytest.mark.parametrize("tier", tier_params("trial_email.source", ["trial_reminders.py"]))
def test_trial_reminder_source_has_no_hardcoded_price(tier):
    src = Path(BACKEND, f"routes/{tier}").read_text()
    assert not re.search(r"\$\d+\.\d{2}", src), (
        "trial_reminders.py hardcodes a dollar price — must come from the catalog"
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


@pytest.mark.parametrize("tier", tier_params("SubscriptionPaywall.family_copy", ["family"]))
def test_paywall_family_tile_copy_is_catalog_driven(tier):
    src = Path(FRONTEND, "components/SubscriptionPaywall.js").read_text()
    for legacy in ("$3.49", "$1/mo", "Floor tiers exempt", "Owner pays standard tier rate"):
        assert legacy not in src, f"SubscriptionPaywall.js still carries legacy family-plan copy {legacy!r}"
    for key in ("family_benefactor_discount_percent", "family_beneficiary_discount_percent"):
        assert key in src, f"SubscriptionPaywall.js family tile must render {key} from /subscriptions/plans"


_BEN_PRICE_DISPLAY = {
    "SubscriptionPaywall": "components/SubscriptionPaywall.js",
    "SubscriptionManagement": "components/settings/SubscriptionManagement.js",
}


@pytest.mark.parametrize("comp", tier_params("ben_price_display", list(_BEN_PRICE_DISPLAY)))
def test_beneficiary_price_display_uses_catalog_cycle_prices(comp):
    src = Path(FRONTEND, _BEN_PRICE_DISPLAY[comp]).read_text()
    assert not re.search(r"ben_price\s*\*\s*0\.[89]", src), (
        f"{comp}: derives beneficiary quarterly/annual price as ben_price × 0.9/0.8 — flat-rate ben tiers "
        "(military/veteran/seniors/new_adult) are 1.99 on every cycle; read beneficiary_plans[ben_<tier>] instead"
    )
    assert "beneficiary_plans" in src, f"{comp}: must read beneficiary_plans from /subscriptions/plans"


# --------------------------------------------------------- DB-backed stages 2b/3/4/5/7 ----
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


@pytest.mark.parametrize("tier", tier_params("status.dob_eligibility", ["new_adult", "seniors"]))
def test_status_dob_eligibility_unlocks_age_tier(world, tier):
    got = world["dob_eligibility"][tier]
    assert tier in (got or []), f"{tier}: eligible_tiers={got!r} for a user whose DOB qualifies → card locked by age"


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


@pytest.mark.parametrize("tier", tier_params("family.preview_beneficiary", TIERS))
def test_family_preview_lists_beneficiary_at_own_tier_price(world, tier):
    tree = world["tiers"][tier]["preview_tree"]
    rows = [r for r in tree if r.get("role") == "beneficiary" and r.get("email") == f"bn-{tier}@carryontest.io"]
    assert rows, (
        f"{tier}: preview_family_savings tree has no beneficiary row (estates queried by the wrong key?): {tree}"
    )
    ben_price = float(BEN_PLAN[f"ben_{tier}"]["price"])
    assert _close(rows[0]["current_price"], ben_price), (
        f"{tier}: preview current_price {rows[0]['current_price']} != {ben_price}"
    )
    assert _close(rows[0]["family_price"], round(ben_price * (1 - BENEFICIARY_DISC / 100), 2)), (
        f"{tier}: preview family_price {rows[0]['family_price']} != {ben_price} less {BENEFICIARY_DISC}%"
    )


@pytest.mark.parametrize("tier", tier_params("checkout.benefactor", TIERS))
def test_checkout_amount_matches_catalog_for_benefactor(world, tier):
    _assert_amounts(world["tiers"][tier]["checkout"]["benefactor"], PLAN[tier], f"{tier} checkout")


@pytest.mark.parametrize("tier", tier_params("checkout.beneficiary", BEN_TIERS))
def test_checkout_amount_matches_catalog_for_beneficiary(world, tier):
    co = world["tiers"][tier[len("ben_") :]]["checkout"]["beneficiary"]
    _assert_amounts(co, BEN_PLAN[tier], f"{tier} checkout")


@pytest.mark.parametrize("tier", tier_params("checkout.beta.benefactor", TIERS))
def test_beta_checkout_records_benefactor_plan(world, tier):
    got = world["tiers"][tier]["beta_checkout"]["benefactor"]
    assert got.get("plan_id") == tier and got.get("plan_name") == PLAN[tier]["name"], (
        f"{tier}: beta checkout recorded {got}"
    )


@pytest.mark.parametrize("tier", tier_params("checkout.beta.beneficiary", BEN_TIERS))
def test_beta_checkout_records_beneficiary_plan(world, tier):
    got = world["tiers"][tier[len("ben_") :]]["beta_checkout"]["beneficiary"]
    assert got.get("plan_id") == tier and got.get("plan_name") == BEN_PLAN[tier]["name"], (
        f"{tier}: beta checkout recorded {got} (ben_* preference not saved)"
    )


@pytest.mark.parametrize("tier", tier_params("change_plan.benefactor", TIERS))
def test_change_plan_amount_matches_catalog_for_benefactor(world, tier):
    _assert_amounts(world["tiers"][tier]["change_plan"]["benefactor"], PLAN[tier], f"{tier} change-plan")


@pytest.mark.parametrize("tier", tier_params("change_plan.beneficiary", BEN_TIERS))
def test_change_plan_amount_matches_catalog_for_beneficiary(world, tier):
    cp = world["tiers"][tier[len("ben_") :]]["change_plan"]["beneficiary"]
    _assert_amounts(cp, BEN_PLAN[tier], f"{tier} change-plan")


@pytest.mark.parametrize("tier", tier_params("change_plan.discounted_benefactor", TIERS))
def test_change_plan_applies_custom_discount_on_every_cycle(world, tier):
    """Rule: discount applies to the full-period amount (monthly, quarterly×3, annual×12) — same as checkout."""
    cp = world["tiers"][tier]["change_plan"]["discounted_benefactor"]
    _assert_amounts(cp, PLAN[tier], f"{tier} change-plan @{CUSTOM_DISCOUNT}%", discount=CUSTOM_DISCOUNT)


@pytest.mark.parametrize("tier", tier_params("change_billing.benefactor", TIERS))
def test_change_billing_amount_matches_catalog_for_benefactor(world, tier):
    cb = world["tiers"][tier]["change_billing"]["benefactor"]
    _assert_amounts(cb, PLAN[tier], f"{tier} change-billing", cycles=("quarterly", "annual"))


@pytest.mark.parametrize("tier", tier_params("change_billing.beneficiary", BEN_TIERS))
def test_change_billing_amount_matches_catalog_for_beneficiary(world, tier):
    cb = world["tiers"][tier[len("ben_") :]]["change_billing"]["beneficiary"]
    _assert_amounts(cb, BEN_PLAN[tier], f"{tier} change-billing", cycles=("quarterly", "annual"))


@pytest.mark.parametrize("tier", tier_params("lifecycle.age_out", ["new_adult"]))
def test_new_adult_age_out_lands_on_benefactor_standard(world, tier):
    got = world["age_out"]
    assert got.get("plan_id") == "standard", (
        f"aged-out new_adult subscription now on {got!r} (must be benefactor 'standard')"
    )
    assert got.get("plan_name") == PLAN["standard"]["name"], f"aged-out plan_name {got.get('plan_name')!r}"


@pytest.mark.parametrize("tier", tier_params("trial_email.starting_price", ["reminder", "expired"]))
def test_trial_emails_quote_catalog_starting_price(world, tier):
    emails = world["trial_emails"]
    assert emails, "trial_reminders.starting_monthly_price() missing — emails cannot quote the catalog"
    exp = _starting_monthly_price()
    assert _close(emails["starting_price"], exp), f"starting price {emails['starting_price']} != catalog {exp}"
    quoted = re.findall(r"\$(\d+\.\d{2})/mo", emails[tier])
    assert quoted and all(_close(q, exp) for q in quoted), f"{tier} email quotes {quoted}, catalog says {exp:.2f}"


@pytest.mark.parametrize("tier", tier_params("apple_iap.activation", PAID_TIERS + PAID_BEN_TIERS))
def test_apple_iap_activates_own_plan_with_catalog_name(world, tier):
    got = world["apple"][tier]
    assert "error" not in got, f"{tier}: Apple product us.carryon.app.v2.{tier}_monthly rejected: {got['error']}"
    assert got.get("plan_id") == tier, f"{tier}: activated {got.get('plan_id')!r}"
    assert got.get("plan_name") == ANY_PLAN[tier]["name"], f"{tier}: plan_name {got.get('plan_name')!r} != catalog"


@pytest.mark.parametrize("tier", tier_params("admin.ben_price_edit", ["ben_military", "ben_premium"]))
def test_admin_beneficiary_price_edit_respects_billing_toggle(world, tier):
    got = world["admin_ben_price_edit"][tier]
    assert _close(got["price"], 2.49)
    if BEN_PLAN[tier].get("allows_billing_toggle"):
        assert _close(got["quarterly_price"], round(2.49 * 0.9, 2)) and _close(
            got["annual_price"], round(2.49 * 0.8, 2)
        ), got
    else:
        assert _close(got["quarterly_price"], 2.49) and _close(got["annual_price"], 2.49), (
            f"{tier}: flat-rate plan must keep one price on every cycle, got {got}"
        )


@pytest.mark.parametrize("tier", tier_params("settings.ben_cycle_heal", ["ben_military", "ben_premium"]))
def test_stored_beneficiary_cycle_prices_self_heal_on_load(world, tier):
    """A drifted stored beneficiary plan (e.g. flat-rate tier saved as 1.99/1.79/1.59) is healed on settings load."""
    got = world["settings_ben_cycle_heal"][tier]
    cat = BEN_PLAN[tier]
    assert got.get("allows_billing_toggle") == cat["allows_billing_toggle"], (
        f"{tier}: missing key not merged from code: {got}"
    )
    for k in ("price", "quarterly_price", "annual_price"):
        assert _close(got[k], cat[k]), f"{tier}: stored {k}={got[k]} not healed to catalog {cat[k]} — {got}"


# ------------------------------------------------ stage 8: benefactor charges are frozen ----
def _benefactor_snapshot(world):
    snap = {}
    for t in TIERS:
        row = world["tiers"][t]
        snap[t] = {
            "checkout": row["checkout"]["benefactor"],
            "change_plan": row["change_plan"]["benefactor"],
            "change_billing": row["change_billing"]["benefactor"],
            "beta_checkout": row["beta_checkout"]["benefactor"],
        }
    return snap


@pytest.mark.parametrize("tier", tier_params("baseline.benefactor", TIERS))
def test_benefactor_amounts_identical_to_frozen_baseline(world, tier):
    """No change on this branch may alter what a benefactor (without custom_discount) is charged."""
    baseline = json.loads(BASELINE.read_text())
    assert _benefactor_snapshot(world)[tier] == baseline[tier], (
        f"{tier}: benefactor billing differs from the frozen pre-fix baseline {BASELINE.name}"
    )
