"""
CarryOn Platform Rules — Single source of truth for all business rules.
Editable only by founder. Read-only for all other admin roles.
Changes propagate immediately platform-wide.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from config import db, xai_client, XAI_MODEL_LIGHT, logger
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
    # Merge any new default rules not yet in stored rules, and backfill missing fields
    stored = doc["rules"]
    stored_map = {r["id"]: r for r in stored}
    changed = False
    for default in DEFAULT_RULES:
        if default["id"] not in stored_map:
            # New rule — add it
            stored.append(dict(default))
            changed = True
        else:
            # Existing rule — backfill missing fields (like narrative)
            existing = stored_map[default["id"]]
            for key in ("narrative", "value_type", "editable_value"):
                if key in default and key not in existing:
                    existing[key] = default[key]
                    changed = True
    if changed:
        await db.platform_rules.update_one(
            {"_id": "global"},
            {"$set": {"rules": stored, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return stored


async def generate_narrative(rule: Dict[str, Any], all_rules: List[Dict[str, Any]]) -> str:
    """Auto-generate a customer-facing narrative for a rule using Grok."""
    if not xai_client:
        return ""
    # Build context from all rules in the same category
    category_context = "\n".join(
        f"- {r['label']}: {r['value']} ({r['description']})" for r in all_rules if r["category"] == rule["category"]
    )
    prompt = f"""You are writing an internal reference guide for CarryOn customer service agents.
For the following business rule, write a clear, conversational paragraph that:
1. Explains what the rule means in plain language
2. Includes a concrete dollar-amount example where applicable (use Premium tier at $24.99/mo as the example baseline)
3. Ends with a "Tell the customer:" script the agent can read verbatim

Category: {rule["category"]}
Rule: {rule["label"]}
Current Value: {rule["value"]}
Short Description: {rule["description"]}

Other rules in this category for context:
{category_context}

Write only the paragraph. No headers, no bullet points. Keep it under 100 words."""

    try:
        import asyncio

        resp = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: xai_client.chat.completions.create(
                model=XAI_MODEL_LIGHT,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
                temperature=0.3,
            ),
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Narrative generation failed for {rule['id']}: {e}")
        return ""


@router.get("/admin/platform-rules")
async def get_rules(current_user: dict = Depends(get_current_user)):
    """Get all platform rules. Available to all admin roles (read-only for non-founders)."""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    rules = await get_platform_rules()
    is_founder = current_user.get("role") == "admin"
    return {"rules": rules, "editable": is_founder}


class RuleUpdateRequest(BaseModel):
    rule_id: str
    value: str


@router.put("/admin/platform-rules")
async def update_rule(req: RuleUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update a single platform rule. Founder only."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the founder can edit platform rules")
    rules = await get_platform_rules()
    found = False
    target_rule = None
    for rule in rules:
        if rule["id"] == req.rule_id:
            if not rule.get("editable_value", False):
                raise HTTPException(status_code=400, detail="This rule is not editable")
            rule["value"] = req.value
            target_rule = rule
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Rule not found")
    # Auto-regenerate narrative for the updated rule
    narrative = await generate_narrative(target_rule, rules)
    if narrative:
        target_rule["narrative"] = narrative
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


@router.post("/admin/platform-rules/generate-narratives")
async def generate_all_narratives(bg: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Kick off narrative generation as a background task. Founder only."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the founder can generate narratives")

    async def _run():
        import asyncio

        rules = await get_platform_rules()
        # Generate in batches of 5 to avoid rate limits
        indices_needing = [i for i, r in enumerate(rules) if not r.get("narrative")]
        for batch_start in range(0, len(indices_needing), 5):
            batch = indices_needing[batch_start : batch_start + 5]
            tasks = [generate_narrative(rules[i], rules) for i in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for idx, result in zip(batch, results):
                if isinstance(result, str) and result:
                    rules[idx]["narrative"] = result
        await db.platform_rules.update_one(
            {"_id": "global"},
            {"$set": {"rules": rules, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        count = sum(1 for i in indices_needing if rules[i].get("narrative"))
        logger.info(f"Generated {count} narratives for platform rules")

    bg.add_task(_run)
    return {"success": True, "message": "Generating narratives in the background. Refresh in about 30 seconds."}
