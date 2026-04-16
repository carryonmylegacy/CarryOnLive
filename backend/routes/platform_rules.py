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
        "narrative": "When a customer subscribes on a month-to-month basis, they pay the full listed price for their tier. There is no discount for monthly billing — it is the baseline price that all other discounts are calculated from.",
        "editable_value": False,
    },
    {
        "id": "billing_quarterly_discount",
        "category": "Billing Cycle Discounts",
        "label": "Quarterly Billing Discount",
        "value": "10%",
        "description": "Off monthly price",
        "narrative": "When a customer chooses quarterly billing, they commit to 3 months at a time and receive a 10% discount off what they would pay monthly. For example, if their monthly rate is $24.99, their quarterly rate would be $22.49/mo (billed as $67.47 every 3 months). This saves them roughly $2.50 per month.",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "billing_annual_discount",
        "category": "Billing Cycle Discounts",
        "label": "Annual Billing Discount",
        "value": "20%",
        "description": "Off monthly price",
        "narrative": "When a customer chooses annual billing, they commit to a full year and receive a 20% discount off the monthly price. For example, if their monthly rate is $24.99, their annual rate would be $19.99/mo (billed as $239.88 per year). This is the best value for recurring subscribers and saves them about $60 per year on the Premium plan.",
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
        "narrative": "When a benefactor enables the Family Plan to bundle their household, they receive an additional 30% discount that stacks on top of their billing cycle discount. For example, an annual Premium subscriber already getting 20% off ($19.99/mo) would get an additional 30% off, bringing their effective rate to $13.99/mo. Tell the customer: 'The Family Plan discount is in addition to whatever savings you already get from your billing cycle — they stack together.'",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "family_beneficiary_discount",
        "category": "Family Plan Discounts",
        "label": "Family Plan — Beneficiary Discount",
        "value": "50%",
        "description": "Stacks on billing cycle discount",
        "narrative": "Beneficiaries on a Family Plan receive an even deeper discount — 50% off, stacking on top of their billing cycle discount. For example, a Premium beneficiary paying $6.99/mo on an annual plan (20% off = $5.59/mo) would get an additional 50% off, bringing them to $2.80/mo. Tell the customer: 'Your family members save even more than you do on the Family Plan — their beneficiary rate is already lower, and the 50% family discount makes it incredibly affordable.'",
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
        "narrative": "Every new user gets a free 30-day trial with full access to all features at their selected tier. No credit card is required to start the trial. Tell the customer: 'You have 30 days to explore everything CarryOn has to offer at no cost. When your trial ends, you can choose any plan that fits your needs, or your access will be paused until you subscribe.'",
        "editable_value": True,
        "value_type": "days",
    },
    {
        "id": "payment_grace_period",
        "category": "Trial & Grace Periods",
        "label": "Payment Grace Period",
        "value": "30 days",
        "description": "Missed payment before action taken",
        "narrative": "If a customer misses a payment, they have a 30-day grace period during which their access remains fully active. We will attempt to charge their payment method again during this window. If the payment is not resolved within 30 days, their subscription will be paused. Tell the customer: 'Don't worry — if a payment fails, you still have 30 days of full access while we sort it out. Just make sure your payment method is updated before the grace period ends.'",
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
        "narrative": "Beneficiaries are never billed while their benefactor is alive and has an active subscription. Beneficiary billing only begins after the benefactor transitions (passes away) and a 30-day grace period has elapsed. Tell the customer: 'As long as your benefactor maintains their subscription, you will never be charged. Your access is covered by their plan. Billing for beneficiaries only begins after the benefactor has passed, and even then, there is a 30-day grace period before any charges apply.'",
        "editable_value": False,
    },
    # Beta Tester Policy
    {
        "id": "beta_tester_exemption",
        "category": "Beta Tester Policy",
        "label": "Beta Tester Exemption",
        "value": "Trial + payment exempt",
        "description": "While beta flag is active on user account",
        "narrative": "Users flagged as beta testers have full access to all platform features without any trial countdown or payment requirement. This status is manually granted by the founder and can be revoked at any time. Beta testers will not see trial banners or subscription prompts. Tell the customer: 'You have been selected as a beta tester, which means you have full free access while you help us refine the platform. Thank you for your participation.'",
        "editable_value": False,
    },
    # Verification Requirements
    {
        "id": "verification_required_tiers",
        "category": "Verification Requirements",
        "label": "Verification Required",
        "value": "Military, Veteran, Hospice, New Adult",
        "description": "Tier-specific documentation required before activation",
        "narrative": "Certain tier-level discounts require documentation to verify eligibility. Military and First Responder tiers require proof of active service or employment. Veteran tier requires proof of veteran status (DD-214 or VA card). Hospice tier requires documentation from a hospice care provider. New Adult tier requires proof of age (18-25). Tell the customer: 'To qualify for this special pricing, we just need a quick document to verify your eligibility. This protects the integrity of these discounted rates for those who truly qualify.'",
        "editable_value": False,
    },
    # Founders Circle Rules
    {
        "id": "fc_campaign_active",
        "category": "Founders Circle",
        "label": "Campaign Active",
        "value": "true",
        "description": "Controls visibility of Founders Circle paywall and link on Subscriptions page",
        "narrative": "When this toggle is ON, the Founders Circle lifetime subscription offer is visible to all users on the Subscriptions page, and the dedicated Founders Circle paywall page is accessible. When turned OFF, both the link and the page disappear — but existing Founders Circle members are completely unaffected. Their lifetime access continues permanently regardless of this setting.",
        "editable_value": True,
        "value_type": "toggle",
    },
    {
        "id": "fc_beneficiaries_free",
        "category": "Founders Circle",
        "label": "Beneficiaries Free",
        "value": "All payment schedules",
        "description": "Current and future beneficiaries get free lifetime access, per estate",
        "narrative": "This is the signature benefit of Founders Circle. Every beneficiary linked to a Founders Circle estate — both those already added and any added in the future — receives completely free lifetime access at the benefactor's tier level. This applies regardless of which payment schedule the benefactor chose (pay-in-full, 3, 6, or 12 payments). Tell the customer: 'When you join the Founders Circle, your family members never pay a dime. Not now, not ever. Any beneficiary you add to your estate — today or 20 years from now — gets the same free lifetime access.'",
        "editable_value": False,
    },
    {
        "id": "fc_upgrade_policy",
        "category": "Founders Circle",
        "label": "Upgrade Policy",
        "value": "Pay the delta",
        "description": "Same installment and discount options apply to the delta amount between tiers",
        "narrative": "If a Founders Circle member wants to upgrade to a higher tier during the campaign period, they simply pay the difference between what they already paid and the new tier's lifetime price. The same installment options and discounts apply to this difference. For example, if someone has Base ($199) and wants Premium ($499), they pay the $300 delta — with 1-pay at 15% off ($255), or 3 payments of $90, etc. Tell the customer: 'You can upgrade anytime during our first year — just pay the difference. You get the same flexible payment options and discounts on the upgrade amount.'",
        "editable_value": False,
    },
    {
        "id": "fc_post_campaign_upgrades",
        "category": "Founders Circle",
        "label": "Post-Campaign Upgrades",
        "value": "Regular pricing only",
        "description": "Lifetime tier becomes permanent floor. Higher tiers require normal subscription.",
        "narrative": "After the Founders Circle campaign ends (approximately one year), no new lifetime subscriptions can be purchased. Existing members who want a higher tier after the campaign can subscribe to it at regular monthly/quarterly/annual pricing. However, their Founders Circle tier is their permanent floor — if they ever cancel the higher subscription, they automatically fall back to their lifetime tier and never lose access entirely. Tell the customer: 'Your Founders Circle tier is yours forever. If you upgrade to a higher plan later and decide to cancel it, you'll always fall back to your lifetime tier — you'll never be locked out.'",
        "editable_value": False,
    },
    {
        "id": "fc_installment_failure",
        "category": "Founders Circle",
        "label": "Installment Failure",
        "value": "Grace period then clean cut",
        "description": "30-day grace period. After that, lose lifetime status and revert to regular monthly subscription. No partial credit.",
        "narrative": "If a Founders Circle member on an installment plan misses a payment, they have the standard 30-day grace period to resolve it. If the payment is not made within that window, their Founders Circle lifetime status is revoked — they lose the lifetime benefit and are moved to a regular monthly subscription at their tier. There is no partial credit for payments already made. Tell the customer: 'We understand things happen, so you have 30 days to update your payment if one fails. But if it's not resolved in that window, the lifetime benefit is forfeited. We strongly recommend keeping your payment method up to date.'",
        "editable_value": False,
    },
    {
        "id": "fc_transition_during_installments",
        "category": "Founders Circle",
        "label": "Transition During Installments",
        "value": "Honored in full",
        "description": "If benefactor passes during active installment plan, Founders Circle is honored as a gesture of kindness. Estate retains lifetime access regardless of remaining payments.",
        "narrative": "If a Founders Circle benefactor passes away while still in the middle of their installment payments, CarryOn will honor the full Founders Circle lifetime subscription as a gesture of kindness. The remaining payments are forgiven, and the estate, the trustee, and all associated beneficiaries retain their lifetime access at the purchased tier level. Tell the customer's family: 'We are deeply sorry for your loss. Your loved one's Founders Circle membership is fully honored. The estate and all beneficiaries will continue to have lifetime access — there are no remaining payments.'",
        "editable_value": False,
    },
    {
        "id": "fc_scope",
        "category": "Founders Circle",
        "label": "Scope",
        "value": "Per estate",
        "description": "Must purchase Founders Circle separately for each estate. Associated beneficiaries of that estate enjoy the privileges.",
        "narrative": "Founders Circle is tied to a specific estate, not to the user's account globally. If a benefactor manages multiple estates, they would need to purchase a separate Founders Circle lifetime subscription for each estate they want covered. The beneficiaries of each Founders Circle estate enjoy the free lifetime access benefit, but beneficiaries of their non-Founders Circle estates do not. Tell the customer: 'The Founders Circle benefit applies per estate. If you have multiple estates and want lifetime coverage for all of them, you would select each one separately during checkout.'",
        "editable_value": False,
    },
    {
        "id": "fc_1pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "1-Payment Discount",
        "value": "15%",
        "description": "Off lifetime base price — pay in full",
        "narrative": "Customers who pay for their Founders Circle membership in a single upfront payment receive the deepest discount: 15% off the lifetime base price. For example, Premium at $499 becomes $424 when paid in full. Tell the customer: 'Paying in full today gives you the best possible price — 15% off the lifetime rate. It's the most savings for the biggest commitment.'",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_3pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "3-Payment Discount",
        "value": "10%",
        "description": "Off lifetime base price — 3 installments",
        "narrative": "Customers who choose 3 monthly payments receive a 10% discount off the lifetime base price. For example, Premium at $499 becomes $449 total, split into 3 monthly payments of $150. Tell the customer: 'Spreading it over 3 months still saves you 10%, and you get the full Founders Circle benefits from your very first payment.'",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_6pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "6-Payment Discount",
        "value": "5%",
        "description": "Off lifetime base price — 6 installments",
        "narrative": "Customers who choose 6 monthly payments receive a 5% discount off the lifetime base price. For example, Premium at $499 becomes $474 total, split into 6 monthly payments of $79. Tell the customer: 'Six months of payments keeps things very manageable, and you still get a 5% discount. All Founders Circle benefits are active from day one.'",
        "editable_value": True,
        "value_type": "percent",
    },
    {
        "id": "fc_12pay_discount",
        "category": "Founders Circle Installment Discounts",
        "label": "12-Payment Discount",
        "value": "0%",
        "description": "Full lifetime base price — 12 installments (convenience is the benefit)",
        "narrative": "Customers who choose 12 monthly payments pay the full lifetime base price with no additional discount — the benefit here is the convenience of spreading the cost over a full year. For example, Premium at $499 is split into 12 monthly payments of $42. Tell the customer: 'The 12-month option gives you the lowest monthly payment possible. While there's no additional discount, you're still locking in lifetime access at a fraction of what monthly subscribers will pay over time — and your beneficiaries are covered free forever.'",
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
    scope = current_user.get("admin_scope", "")
    is_founder = (
        current_user.get("operator_role") == "founder"
        or scope == "founder"
        or (isinstance(scope, list) and "founder" in scope)
    )
    return {"rules": rules, "editable": is_founder}


class RuleUpdateRequest(BaseModel):
    rule_id: str
    value: str


@router.put("/admin/platform-rules")
async def update_rule(req: RuleUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update a single platform rule. Founder only."""
    scope = current_user.get("admin_scope", "")
    is_founder = (
        current_user.get("operator_role") == "founder"
        or scope == "founder"
        or (isinstance(scope, list) and "founder" in scope)
    )
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
