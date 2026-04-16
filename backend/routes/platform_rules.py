"""
CarryOn Platform Rules — Single source of truth for all business rules.
Editable only by founder. Read-only for all other admin roles.
Changes propagate immediately platform-wide.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()

# ── Default Rules ──
DEFAULT_RULES: List[Dict[str, Any]] = [
    # Billing Cycle Discounts
    {
        "id": "billing_monthly",
        "category": "Billing Cycle Discounts",
        "label": "Monthly Billing",
        "value": "Full price",
        "description": "No discount applied",
        "editable_value": False,
    },
    {
        "id": "billing_quarterly_discount",
        "category": "Billing Cycle Discounts",
        "label": "Quarterly Billing Discount",
        "value": "10%",
        "description": "Off monthly price",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "billing_annual_discount",
        "category": "Billing Cycle Discounts",
        "label": "Annual Billing Discount",
        "value": "20%",
        "description": "Off monthly price",
        "editable_value": True,
        "value_type": "percent",
    },
    # Family Plan Discounts
    {
        "id": "family_benefactor_discount",
        "category": "Family Plan Discounts",
        "label": "Family Plan — Benefactor Discount",
        "value": "30%",
        "description": "Stacks on billing cycle discount",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "family_beneficiary_discount",
        "category": "Family Plan Discounts",
        "label": "Family Plan — Beneficiary Discount",
        "value": "50%",
        "description": "Stacks on billing cycle discount",
        "editable_value": True,
        "value_type": "percent",
    },
    # Trial & Grace Periods
    {
        "id": "free_trial_duration",
        "category": "Trial & Grace Periods",
        "label": "Free Trial Duration",
        "value": "30 days",
        "description": "All new users",
        "editable_value": True,
        "value_type": "days",
    },
    {
        "id": "payment_grace_period",
        "category": "Trial & Grace Periods",
        "label": "Payment Grace Period",
        "value": "30 days",
        "description": "Missed payment before action taken",
        "editable_value": True,
        "value_type": "days",
    },
    # Beneficiary Billing
    {
        "id": "beneficiary_billing_trigger",
        "category": "Beneficiary Billing",
        "label": "Beneficiary Billing Trigger",
        "value": "Benefactor transition",
        "description": "Beneficiaries don't pay until benefactor passes",
        "editable_value": False,
    },
    # Beta Tester Policy
    {
        "id": "beta_tester_exemption",
        "category": "Beta Tester Policy",
        "label": "Beta Tester Exemption",
        "value": "Trial + payment exempt",
        "description": "While beta flag is active on user account",
        "editable_value": False,
    },
    # Verification Requirements
    {
        "id": "verification_required_tiers",
        "category": "Verification Requirements",
        "label": "Verification Required",
        "value": "Military, Veteran, Hospice, New Adult",
        "description": "Tier-specific documentation required before activation",
        "editable_value": False,
    },
    # Founders Circle Rules
    {
        "id": "fc_campaign_active",
        "category": "Founders Circle",
        "label": "Campaign Active",
        "value": "true",
        "description": "Controls visibility of Founders Circle paywall and link on Subscriptions page",
        "editable_value": True,
        "value_type": "toggle",
    },
    {
        "id": "fc_beneficiaries_free",
        "category": "Founders Circle",
        "label": "Beneficiaries Free",
        "value": "All payment schedules",
        "description": "Current and future beneficiaries get free lifetime access, per estate",
        "editable_value": False,
    },
    {
        "id": "fc_upgrade_policy",
        "category": "Founders Circle",
        "label": "Upgrade Policy",
        "value": "Pay the delta",
        "description": "Same installment and discount options apply to the delta amount between tiers",
        "editable_value": False,
    },
    {
        "id": "fc_post_campaign_upgrades",
        "category": "Founders Circle",
        "label": "Post-Campaign Upgrades",
        "value": "Regular pricing only",
        "description": "Lifetime tier becomes permanent floor. Higher tiers require normal subscription.",
        "editable_value": False,
    },
    {
        "id": "fc_installment_failure",
        "category": "Founders Circle",
        "label": "Installment Failure",
        "value": "Grace period then clean cut",
        "description": "30-day grace period. After that, lose lifetime status and revert to regular monthly subscription. No partial credit.",
        "editable_value": False,
    },
    {
        "id": "fc_transition_during_installments",
        "category": "Founders Circle",
        "label": "Transition During Installments",
        "value": "Honored in full",
        "description": "If benefactor passes during active installment plan, Founders Circle is honored as a gesture of kindness. Estate retains lifetime access regardless of remaining payments.",
        "editable_value": False,
    },
    {
        "id": "fc_scope",
        "category": "Founders Circle",
        "label": "Scope",
        "value": "Per estate",
        "description": "Must purchase Founders Circle separately for each estate. Associated beneficiaries of that estate enjoy the privileges.",
        "editable_value": False,
    },
    {
        "id": "fc_1pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "1-Payment Discount",
        "value": "15%",
        "description": "Off lifetime base price — pay in full",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_3pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "3-Payment Discount",
        "value": "10%",
        "description": "Off lifetime base price — 3 installments",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_6pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "6-Payment Discount",
        "value": "5%",
        "description": "Off lifetime base price — 6 installments",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_12pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "12-Payment Discount",
        "value": "0%",
        "description": "Full lifetime base price — 12 installments (convenience is the benefit)",
        "editable_value": True,
        "value_type": "percent",
    },
]


async def get_platform_rules() -> List[Dict[str, Any]]:
    """Get all platform rules, initializing defaults if needed."""
    doc = await db.platform_rules.find_one({"_id": "global"}, {"_id": 0})
    if not doc or not doc.get("rules"):
        rules = [dict(r) for r in DEFAULT_RULES]
        await db.platform_rules.update_one(
            {"_id": "global"},
            {"$set": {"rules": rules, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return rules
    # Merge any new default rules not yet in stored rules
    stored = doc["rules"]
    stored_ids = {r["id"] for r in stored}
    changed = False
    for default in DEFAULT_RULES:
        if default["id"] not in stored_ids:
            stored.append(dict(default))
            changed = True
    if changed:
        await db.platform_rules.update_one(
            {"_id": "global"},
            {"$set": {"rules": stored, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return stored


@router.get("/admin/platform-rules")
async def get_rules(current_user: dict = Depends(get_current_user)):
    """Get all platform rules. Available to all admin roles (read-only for non-founders)."""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    rules = await get_platform_rules()
    is_founder = current_user.get("operator_role") == "founder" or current_user.get("admin_scope") == "founder"
    return {"rules": rules, "editable": is_founder}


class RuleUpdateRequest(BaseModel):
    rule_id: str
    value: str


@router.put("/admin/platform-rules")
async def update_rule(req: RuleUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update a single platform rule. Founder only."""
    is_founder = current_user.get("operator_role") == "founder" or current_user.get("admin_scope") == "founder"
    if not is_founder:
        raise HTTPException(status_code=403, detail="Only the founder can edit platform rules")
    rules = await get_platform_rules()
    found = False
    for rule in rules:
        if rule["id"] == req.rule_id:
            if not rule.get("editable_value", False):
                raise HTTPException(status_code=400, detail="This rule is not editable")
            rule["value"] = req.value
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.platform_rules.update_one(
        {"_id": "global"},
        {
            "$set": {
                "rules": rules,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"],
            }
        },
    )
    return {"success": True, "rules": rules}
