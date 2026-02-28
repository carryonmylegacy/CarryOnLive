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
    fp = await db.family_plans.find_one(
        {"fpo_user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    if fp:
        return {"enabled": True, "role": "fpo", "family_plan": fp, "current_plan_id": fp.get("plan_id")}

    # Check if user is a member
    fp = await db.family_plans.find_one(
        {"members.user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    if fp:
        member = next(
            (m for m in fp.get("members", []) if m["user_id"] == current_user["id"]),
            None,
        )
        return {
            "enabled": True,
            "role": member.get("role", "member") if member else "member",
            "family_plan": fp,
        }

    # Check user's current subscription plan
    user_sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    current_plan_id = user_sub.get("plan_id") if user_sub else None

    return {"enabled": True, "role": None, "family_plan": None, "current_plan_id": current_plan_id}


@router.post("/family-plan/create")
async def create_family_plan(
    data: FamilyPlanCreate, current_user: dict = Depends(get_current_user)
):
    """Create a family plan — current user becomes FPO"""
    if not await is_family_plan_enabled():
        raise HTTPException(
            status_code=400, detail="Family plans are not currently available"
        )

    existing = await db.family_plans.find_one(
        {"fpo_user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="You already have an active family plan"
        )

    # Check if already a member of another plan
    existing_member = await db.family_plans.find_one(
        {"members.user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    if existing_member:
        raise HTTPException(
            status_code=400, detail="You are already a member of a family plan"
        )

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
async def add_family_member(
    plan_id: str, data: FamilyPlanInvite, current_user: dict = Depends(get_current_user)
):
    """Add a member to the family plan (FPO only)"""
    fp = await db.family_plans.find_one(
        {"id": plan_id, "fpo_user_id": current_user["id"], "status": "active"},
        {"_id": 0},
    )
    if not fp:
        raise HTTPException(
            status_code=403, detail="Only the Family Plan Owner can add members"
        )

    # Find the user
    member_user = await db.users.find_one(
        {"email": data.email}, {"_id": 0, "password_hash": 0}
    )
    if not member_user:
        raise HTTPException(
            status_code=404,
            detail="User not found. They must have a CarryOn account first.",
        )

    # Check if already a member
    if any(m["user_id"] == member_user["id"] for m in fp.get("members", [])):
        raise HTTPException(
            status_code=400, detail="This user is already in your family plan"
        )

    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}

    if data.role == "benefactor":
        # Get their current subscription tier or default
        user_sub = await db.user_subscriptions.find_one(
            {"user_id": member_user["id"]}, {"_id": 0}
        )
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
                member_user.get("first_name", "")
                + " "
                + member_user.get("last_name", ""),
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
                member_user.get("first_name", "")
                + " "
                + member_user.get("last_name", ""),
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
        raise HTTPException(
            status_code=403, detail="Only the FPO can designate a successor"
        )

    # Verify successor is a member
    member = next(
        (m for m in fp.get("members", []) if m["user_id"] == data.successor_user_id),
        None,
    )
    if not member:
        raise HTTPException(
            status_code=400, detail="Successor must be a member of the family plan"
        )

    successor_user = await db.users.find_one(
        {"id": data.successor_user_id}, {"_id": 0, "password_hash": 0}
    )

    await db.family_plans.update_one(
        {"id": plan_id},
        {
            "$set": {
                "successor_user_id": data.successor_user_id,
                "successor_name": successor_user.get("name", "")
                if successor_user
                else member.get("name", ""),
            }
        },
    )

    return {
        "success": True,
        "message": f"Successor designated: {member.get('name', '')}",
    }


@router.delete("/family-plan/{plan_id}/member/{user_id}")
async def remove_family_member(
    plan_id: str, user_id: str, current_user: dict = Depends(get_current_user)
):
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

    await db.family_plans.update_one(
        {"id": plan_id}, {"$pull": {"members": {"user_id": user_id}}}
    )

    # Clear successor if removed member was the successor
    if fp.get("successor_user_id") == user_id:
        await db.family_plans.update_one(
            {"id": plan_id},
            {"$set": {"successor_user_id": None, "successor_name": None}},
        )

    return {"success": True, "message": "Member removed from family plan"}


@router.delete("/family-plan/{plan_id}")
async def delete_family_plan(
    plan_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete/dissolve a family plan (FPO only)"""
    fp = await db.family_plans.find_one(
        {"id": plan_id, "fpo_user_id": current_user["id"]}, {"_id": 0}
    )
    if not fp:
        raise HTTPException(
            status_code=403, detail="Only the FPO can delete the family plan"
        )

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
