"""CarryOn™ Backend — Family Plan"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from routes.subscriptions import DEFAULT_PLANS, get_subscription_settings
from utils import get_current_user

router = APIRouter()

# ===================== FAMILY PLAN =====================

# Legacy defaults — overridden by dynamic settings from subscription_settings collection
FAMILY_BENEFICIARY_FLAT_RATE = 3.49
FAMILY_BENEFACTOR_DISCOUNT = 1.00
FLOOR_EXEMPT_TIERS = ["new_adult", "military", "hospice"]


async def get_family_discount_settings():
    """Get dynamic family discount percentages from DB settings."""
    settings = await get_subscription_settings()
    return {
        "benefactor_discount_percent": settings.get("family_benefactor_discount_percent", 0),
        "beneficiary_discount_percent": settings.get("family_beneficiary_discount_percent", 0),
    }


class FamilyPlanCreate(BaseModel):
    plan_id: str  # FPO's subscription tier


class FamilyPlanInvite(BaseModel):
    email: str
    role: str = "benefactor"  # benefactor or beneficiary


class FamilyPlanSuccessor(BaseModel):
    successor_user_id: str


async def is_family_plan_enabled():
    """Check if family plan feature is enabled."""
    settings = await get_subscription_settings()
    return settings.get("family_plan_enabled", False)


@router.get("/family-plan/eligible-beneficiaries")
async def family_plan_eligible_beneficiaries(current_user: dict = Depends(get_current_user)):
    """Return the FPO's beneficiaries that can be added to the family plan.

    Filters out:
      • Beneficiaries without an email (no way to invite them)
      • Beneficiaries already on the FPO's family plan
      • Beneficiaries currently in a POST-TRANSITION state — i.e. their
        own benefactor on another estate has passed away and they are
        in post-transition mode. Inviting them to a normal-pricing
        family plan would be inappropriate.
    """
    user_id = current_user["id"]

    # 1. The FPO's own estates' beneficiaries (the universe to consider).
    own_estates = await db.estates.find(
        {"owner_id": user_id, "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1, "status": 1},
    ).to_list(50)
    candidate_estate_ids = [e["id"] for e in own_estates]
    candidates = await db.beneficiaries.find(
        {
            "estate_id": {"$in": candidate_estate_ids},
            "deleted_at": None,
        },
        {"_id": 0},
    ).to_list(500)

    # 2. Build the set of user_ids that are currently in post-transition
    # state — i.e. they are a beneficiary on at least one estate whose
    # status == "transitioned". One DB roundtrip, then a set lookup.
    transitioned_estate_ids = await db.estates.distinct("id", {"status": "transitioned"})
    post_transition_user_ids: set[str] = set()
    if transitioned_estate_ids:
        async for b in db.beneficiaries.find(
            {"estate_id": {"$in": transitioned_estate_ids}, "deleted_at": None},
            {"_id": 0, "id": 1, "user_id": 1},
        ):
            if b.get("user_id"):
                post_transition_user_ids.add(b["user_id"])

    # 3. Already-on-plan emails (so the picker doesn't re-offer them).
    fp = await db.family_plans.find_one({"fpo_user_id": user_id, "deleted_at": None}, {"_id": 0})
    on_plan_emails: set[str] = set()
    if fp:
        for m in fp.get("members") or []:
            if m.get("email"):
                on_plan_emails.add(m["email"].lower())

    # 4. Apply filters and dedupe by email.
    estate_name_by_id = {e["id"]: e.get("name") for e in own_estates}
    by_email: dict[str, dict] = {}
    for b in candidates:
        email = (b.get("email") or "").lower().strip()
        if not email:
            continue
        if email in on_plan_emails:
            continue
        if b.get("user_id") and b["user_id"] in post_transition_user_ids:
            continue
        if email in by_email:
            continue
        by_email[email] = {
            "id": b.get("id"),
            "email": b.get("email"),
            "name": b.get("name") or b.get("email"),
            "estate_id": b.get("estate_id"),
            "estate_name": estate_name_by_id.get(b.get("estate_id")),
            "photo_url": b.get("photo_url") or "",
            "relationship": b.get("relationship") or "",
        }
    return {"beneficiaries": list(by_email.values())}


@router.get("/family-plan/status")
async def get_family_plan_status(current_user: dict = Depends(get_current_user)):
    """Get current user's family plan status"""
    enabled = await is_family_plan_enabled()
    if not enabled:
        return {"enabled": False, "family_plan": None}

    # Check if user is FPO
    fp = await db.family_plans.find_one({"fpo_user_id": current_user["id"], "status": "active"}, {"_id": 0})
    if fp:
        return {
            "enabled": True,
            "role": "fpo",
            "family_plan": fp,
            "current_plan_id": fp.get("plan_id"),
        }

    # Check if user is a member
    fp = await db.family_plans.find_one({"members.user_id": current_user["id"], "status": "active"}, {"_id": 0})
    if fp:
        member = next(
            (m for m in fp.get("members", []) if m["user_id"] == current_user["id"]),
            None,
        )
        return {
            "enabled": True,
            "role": member.get("role", "member") if member else "member",
            "family_plan": fp,
            "current_plan_id": fp.get("plan_id"),
        }

    # Check user's current subscription plan
    user_sub = await db.user_subscriptions.find_one({"user_id": current_user["id"], "status": "active"}, {"_id": 0})
    current_plan_id = user_sub.get("plan_id") if user_sub else None

    return {
        "enabled": True,
        "role": None,
        "family_plan": None,
        "current_plan_id": current_plan_id,
    }


@router.get("/family-plan/preview-savings")
async def preview_family_savings(current_user: dict = Depends(get_current_user)):
    """Preview family tree and potential savings if user activates family plan"""
    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}

    # Get user's current subscription
    user_sub = await db.user_subscriptions.find_one({"user_id": current_user["id"], "status": "active"}, {"_id": 0})
    current_plan_id = user_sub.get("plan_id", "standard") if user_sub else "standard"
    current_plan = plans.get(current_plan_id, plans.get("standard"))

    # Get all estates owned by this user
    estates = await db.estates.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(50)
    estate_ids = [e["id"] for e in estates]

    # Get all beneficiaries across all estates
    beneficiaries = await db.beneficiaries.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(200)

    # Build family tree
    family_tree = []
    total_current_cost = float(current_plan["price"])  # FPO's current cost
    total_family_cost = float(current_plan["price"])  # FPO pays same in family plan

    # Get dynamic family discount settings
    family_discounts = await get_family_discount_settings()
    benefactor_disc_pct = family_discounts["benefactor_discount_percent"]
    beneficiary_disc_pct = family_discounts["beneficiary_discount_percent"]

    # FPO (the current user) — benefactors get % discount
    fpo_discount = round(float(current_plan["price"]) * benefactor_disc_pct / 100, 2)
    family_tree.append(
        {
            "name": current_user.get("name", "You"),
            "email": current_user.get("email", ""),
            "role": "benefactor",
            "relation": "You (FPO)",
            "current_price": float(current_plan["price"]),
            "family_price": round(float(current_plan["price"]) - fpo_discount, 2),
            "savings": fpo_discount,
        }
    )
    total_family_cost -= fpo_discount

    # Each beneficiary
    for ben in beneficiaries:
        ben_email = ben.get("email", "")
        ben_name = ben.get("name", ben.get("first_name", "Unknown"))

        # Check if this beneficiary is also a benefactor (has their own estates)
        is_also_benefactor = False
        ben_user = await db.users.find_one({"email": ben_email}, {"_id": 0}) if ben_email else None
        if ben_user and ben_user.get("role") == "benefactor":
            is_also_benefactor = True

        # Get beneficiary's current subscription cost
        ben_sub = None
        if ben_user:
            ben_sub = await db.user_subscriptions.find_one(
                {"user_id": ben_user.get("id"), "status": "active"}, {"_id": 0}
            )

        if ben_sub:
            ben_current_price = float(ben_sub.get("amount", current_plan.get("ben_price", 4.49)))
        else:
            ben_current_price = float(current_plan.get("ben_price", 4.49))

        if is_also_benefactor:
            # Benefactors in family plan get % discount
            ben_plan = plans.get(ben_sub.get("plan_id", current_plan_id) if ben_sub else current_plan_id)
            ben_current_as_benefactor = float(ben_plan["price"]) if ben_plan else float(current_plan["price"])
            ben_discount = round(ben_current_as_benefactor * benefactor_disc_pct / 100, 2)
            ben_family_price = round(ben_current_as_benefactor - ben_discount, 2)
            family_tree.append(
                {
                    "name": ben_name,
                    "email": ben_email,
                    "role": "benefactor",
                    "relation": ben.get("relation", "Beneficiary") + " (also Benefactor)",
                    "current_price": ben_current_as_benefactor,
                    "family_price": ben_family_price,
                    "savings": ben_discount,
                }
            )
            total_current_cost += ben_current_as_benefactor
            total_family_cost += ben_family_price
        else:
            # Beneficiaries get % discount on their current price
            ben_discount = round(ben_current_price * beneficiary_disc_pct / 100, 2)
            ben_family_price = round(ben_current_price - ben_discount, 2)
            family_tree.append(
                {
                    "name": ben_name,
                    "email": ben_email,
                    "role": "beneficiary",
                    "relation": ben.get("relation", "Beneficiary"),
                    "current_price": ben_current_price,
                    "family_price": ben_family_price,
                    "savings": ben_discount,
                }
            )
            total_current_cost += ben_current_price
            total_family_cost += ben_family_price

    total_savings = total_current_cost - total_family_cost

    return {
        "family_tree": family_tree,
        "current_plan": current_plan.get("name", "Standard"),
        "current_plan_id": current_plan_id,
        "total_current_cost": round(total_current_cost, 2),
        "total_family_cost": round(total_family_cost, 2),
        "total_monthly_savings": round(max(0, total_savings), 2),
        "member_count": len(family_tree),
    }


@router.post("/family-plan/create")
async def create_family_plan(data: FamilyPlanCreate, current_user: dict = Depends(get_current_user)):
    """Create a family plan — current user becomes FPO"""
    if not await is_family_plan_enabled():
        raise HTTPException(status_code=400, detail="Family plans are not currently available")

    existing = await db.family_plans.find_one({"fpo_user_id": current_user["id"], "status": "active"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="You already have an active family plan")

    # Check if already a member of another plan
    existing_member = await db.family_plans.find_one(
        {"members.user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of a family plan")

    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    plan = plans.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")

    fp_id = str(uuid.uuid4())
    family_plan = {
        "id": fp_id,
        "fpo_user_id": current_user["id"],
        "fpo_name": current_user.get("name", ""),
        "fpo_email": current_user.get("email", ""),
        "fpo_plan_id": data.plan_id,
        "successor_user_id": None,
        "successor_name": None,
        "members": [
            {
                "user_id": current_user["id"],
                "name": current_user.get("name", ""),
                "email": current_user.get("email", ""),
                "role": "fpo",
                "member_type": "benefactor",
                "plan_id": data.plan_id,
                "original_price": float(plan["price"]),
                "family_price": float(plan["price"]),  # FPO pays full price
                "discount": 0,
                "joined_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.family_plans.insert_one(family_plan)
    return {
        "id": fp_id,
        "message": "Family plan created. You are the Family Plan Owner (FPO).",
    }


@router.post("/family-plan/{plan_id}/add-member")
async def add_family_member(plan_id: str, data: FamilyPlanInvite, current_user: dict = Depends(get_current_user)):
    """Add a member to the family plan (FPO only)"""
    fp = await db.family_plans.find_one(
        {"id": plan_id, "fpo_user_id": current_user["id"], "status": "active"},
        {"_id": 0},
    )
    if not fp:
        raise HTTPException(status_code=403, detail="Only the Family Plan Owner can add members")

    # Find the user — try username first, then email
    identifier = data.email.strip().lower()
    member_user = await db.users.find_one({"username_lower": identifier}, {"_id": 0, "password_hash": 0})
    if not member_user:
        member_user = await db.users.find_one({"email": identifier}, {"_id": 0, "password_hash": 0})
    if not member_user:
        raise HTTPException(
            status_code=404,
            detail="User not found. They must have a CarryOn account first.",
        )

    # Check if already a member
    if any(m["user_id"] == member_user["id"] for m in fp.get("members", [])):
        raise HTTPException(status_code=400, detail="This user is already in your family plan")

    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}

    # Get dynamic family discount settings
    family_discounts = await get_family_discount_settings()
    benefactor_disc_pct = family_discounts["benefactor_discount_percent"]
    beneficiary_disc_pct = family_discounts["beneficiary_discount_percent"]

    if data.role == "benefactor":
        # Get their current subscription tier or default
        user_sub = await db.user_subscriptions.find_one({"user_id": member_user["id"]}, {"_id": 0})
        member_plan_id = user_sub.get("plan_id", "base") if user_sub else "base"
        plan_info = plans.get(member_plan_id, plans.get("base"))
        original_price = float(plan_info["price"]) if plan_info else 6.99

        # Apply % discount
        discount = round(original_price * benefactor_disc_pct / 100, 2)
        family_price = round(original_price - discount, 2)

        member = {
            "user_id": member_user["id"],
            "name": member_user.get(
                "name",
                member_user.get("first_name", "") + " " + member_user.get("last_name", ""),
            ),
            "email": member_user.get("email", ""),
            "role": "benefactor",
            "member_type": "benefactor",
            "plan_id": member_plan_id,
            "original_price": original_price,
            "family_price": family_price,
            "discount": discount,
            "discount_percent": benefactor_disc_pct,
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Beneficiary — apply % discount on their tier price
        # Determine beneficiary price from their tier
        ben_plan_map = {"premium": "ben_premium", "standard": "ben_standard", "base": "ben_base"}
        fpo_plan_id = fp.get("fpo_plan_id", "base")
        ben_plan_id = ben_plan_map.get(fpo_plan_id, "ben_base")
        ben_plans = {p["id"]: p for p in settings.get("beneficiary_plans", [])}
        ben_plan_info = ben_plans.get(ben_plan_id)
        ben_original_price = float(ben_plan_info["price"]) if ben_plan_info else 4.99
        ben_discount = round(ben_original_price * beneficiary_disc_pct / 100, 2)
        ben_family_price = round(ben_original_price - ben_discount, 2)

        member = {
            "user_id": member_user["id"],
            "name": member_user.get(
                "name",
                member_user.get("first_name", "") + " " + member_user.get("last_name", ""),
            ),
            "email": member_user.get("email", ""),
            "role": "beneficiary",
            "member_type": "beneficiary",
            "plan_id": None,
            "original_price": ben_original_price,
            "family_price": ben_family_price,
            "discount": ben_discount,
            "discount_percent": beneficiary_disc_pct,
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }

    await db.family_plans.update_one({"id": plan_id}, {"$push": {"members": member}})

    return {
        "success": True,
        "message": f"{member_user.get('name', data.email)} added to family plan",
    }


@router.put("/family-plan/{plan_id}/successor")
async def set_family_successor(
    plan_id: str,
    data: FamilyPlanSuccessor,
    current_user: dict = Depends(get_current_user),
):
    """Designate a successor (FPO only)"""
    fp = await db.family_plans.find_one(
        {"id": plan_id, "fpo_user_id": current_user["id"], "status": "active"},
        {"_id": 0},
    )
    if not fp:
        raise HTTPException(status_code=403, detail="Only the FPO can designate a successor")

    # Verify successor is a member
    member = next(
        (m for m in fp.get("members", []) if m["user_id"] == data.successor_user_id),
        None,
    )
    if not member:
        raise HTTPException(status_code=400, detail="Successor must be a member of the family plan")

    successor_user = await db.users.find_one({"id": data.successor_user_id}, {"_id": 0, "password_hash": 0})

    await db.family_plans.update_one(
        {"id": plan_id},
        {
            "$set": {
                "successor_user_id": data.successor_user_id,
                "successor_name": successor_user.get("name", "") if successor_user else member.get("name", ""),
            }
        },
    )

    return {
        "success": True,
        "message": f"Successor designated: {member.get('name', '')}",
    }


@router.delete("/family-plan/{plan_id}/member/{user_id}")
async def remove_family_member(plan_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a member from the family plan (FPO only)"""
    fp = await db.family_plans.find_one(
        {"id": plan_id, "fpo_user_id": current_user["id"], "status": "active"},
        {"_id": 0},
    )
    if not fp:
        raise HTTPException(status_code=403, detail="Only the FPO can remove members")

    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=400,
            detail="FPO cannot remove themselves. Delete the plan instead.",
        )

    await db.family_plans.update_one({"id": plan_id}, {"$pull": {"members": {"user_id": user_id}}})

    # Clear successor if removed member was the successor
    if fp.get("successor_user_id") == user_id:
        await db.family_plans.update_one(
            {"id": plan_id},
            {"$set": {"successor_user_id": None, "successor_name": None}},
        )

    return {"success": True, "message": "Member removed from family plan"}


@router.delete("/family-plan/{plan_id}")
async def delete_family_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete/dissolve a family plan (FPO only)"""
    fp = await db.family_plans.find_one({"id": plan_id, "fpo_user_id": current_user["id"]}, {"_id": 0})
    if not fp:
        raise HTTPException(status_code=403, detail="Only the FPO can delete the family plan")

    await db.family_plans.update_one(
        {"id": plan_id},
        {
            "$set": {
                "status": "dissolved",
                "dissolved_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {
        "success": True,
        "message": "Family plan dissolved. All members return to individual pricing.",
    }


# Admin: Toggle family plan visibility
@router.put("/admin/family-plan-settings")
async def update_family_plan_settings(current_user: dict = Depends(get_current_user)):
    """Toggle family plan availability (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    settings = await get_subscription_settings()
    new_state = not settings.get("family_plan_enabled", False)

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "family_plan_enabled": new_state,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    return {
        "success": True,
        "family_plan_enabled": new_state,
        "message": "Family plans enabled" if new_state else "Family plans disabled",
    }


@router.get("/admin/family-plans")
async def get_all_family_plans(current_user: dict = Depends(get_current_user)):
    """Get all family plans (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    plans = await db.family_plans.find({"status": "active"}, {"_id": 0}).to_list(200)
    return plans
