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

FAMILY_BENEFICIARY_FLAT_RATE = 3.49
FAMILY_BENEFACTOR_DISCOUNT = 1.00
FLOOR_EXEMPT_TIERS = ["new_adult", "military", "hospice"]


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

    # FPO (the current user)
    fpo_discount = 1.0  # benefactors save $1/mo
    family_tree.append(
        {
            "name": current_user.get("name", "You"),
            "email": current_user.get("email", ""),
            "role": "benefactor",
            "relation": "You (FPO)",
            "current_price": float(current_plan["price"]),
            "family_price": float(current_plan["price"]) - fpo_discount,
            "savings": fpo_discount,
        }
    )
    total_family_cost -= fpo_discount

    # Each beneficiary
    ben_flat_price = 3.49
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
            # Benefactors in family plan save $1/mo
            ben_plan = plans.get(ben_sub.get("plan_id", current_plan_id) if ben_sub else current_plan_id)
            ben_current_as_benefactor = float(ben_plan["price"]) if ben_plan else float(current_plan["price"])
            ben_family_price = ben_current_as_benefactor - 1.0
            family_tree.append(
                {
                    "name": ben_name,
                    "email": ben_email,
                    "role": "benefactor",
                    "relation": ben.get("relation", "Beneficiary") + " (also Benefactor)",
                    "current_price": ben_current_as_benefactor,
                    "family_price": ben_family_price,
                    "savings": ben_current_as_benefactor - ben_family_price,
                }
            )
            total_current_cost += ben_current_as_benefactor
            total_family_cost += ben_family_price
        else:
            family_tree.append(
                {
                    "name": ben_name,
                    "email": ben_email,
                    "role": "beneficiary",
                    "relation": ben.get("relation", "Beneficiary"),
                    "current_price": ben_current_price,
                    "family_price": ben_flat_price,
                    "savings": max(0, ben_current_price - ben_flat_price),
                }
            )
            total_current_cost += ben_current_price
            total_family_cost += ben_flat_price

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

    # Find the user
    member_user = await db.users.find_one({"email": data.email}, {"_id": 0, "password_hash": 0})
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

    if data.role == "benefactor":
        # Get their current subscription tier or default
        user_sub = await db.user_subscriptions.find_one({"user_id": member_user["id"]}, {"_id": 0})
        member_plan_id = user_sub.get("plan_id", "base") if user_sub else "base"
        plan_info = plans.get(member_plan_id, plans.get("base"))
        original_price = float(plan_info["price"]) if plan_info else 6.99

        # Apply $1 discount unless floor-exempt
        if member_plan_id in FLOOR_EXEMPT_TIERS:
            discount = 0
            family_price = original_price
        else:
            discount = FAMILY_BENEFACTOR_DISCOUNT
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
            "floor_exempt": member_plan_id in FLOOR_EXEMPT_TIERS,
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Beneficiary — flat rate
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
            "original_price": 0,
            "family_price": FAMILY_BENEFICIARY_FLAT_RATE,
            "discount": 0,
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
