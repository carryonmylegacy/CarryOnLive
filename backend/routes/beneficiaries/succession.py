"""Beneficiaries — succession ordering, reorder, toggle, force-link."""

from ._core import router
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from config import db, logger
from guards import require_benefactor_role, require_estate_owner
from utils import get_current_user


# ── Request models used only by succession routes ────────────────────────────


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


class ForceLinkRequest(BaseModel):
    beneficiary_id: str
    username_or_email: str


@router.put("/beneficiaries/reorder/{estate_id}")
async def reorder_beneficiaries(
    estate_id: str,
    data: ReorderRequest,
    current_user: dict = Depends(get_current_user),
):
    """Persist drag-and-drop beneficiary sort order AND succession hierarchy.
    Only beneficiaries with succession_order != null participate in the chain.
    Position 0 = Primary, 1 = Secondary, 2 = Tertiary, etc."""
    if current_user["role"] not in ("benefactor", "admin") and not (
        current_user["role"] == "beneficiary"
        and (
            await db.users.find_one(
                {"id": current_user["id"]},
                {"_id": 0, "id": 1, "is_also_benefactor": 1},
            )
            or {}
        ).get("is_also_benefactor")
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Fetch current succession participation status for each beneficiary
    all_bens = await db.beneficiaries.find(
        {"estate_id": estate_id, "id": {"$in": data.ordered_ids}, "deleted_at": None},
        {"_id": 0, "id": 1, "succession_order": 1},
    ).to_list(100)
    opted_out = {b["id"] for b in all_bens if b.get("succession_order") is None}

    succ_idx = 0
    for idx, ben_id in enumerate(data.ordered_ids):
        if ben_id in opted_out:
            # Opted out — keep sort_order for display but no succession
            await db.beneficiaries.update_one(
                {"id": ben_id, "estate_id": estate_id},
                {
                    "$set": {
                        "sort_order": idx,
                        "succession_order": None,
                        "is_primary": False,
                    }
                },
            )
        else:
            is_primary = succ_idx == 0
            await db.beneficiaries.update_one(
                {"id": ben_id, "estate_id": estate_id},
                {
                    "$set": {
                        "sort_order": idx,
                        "succession_order": succ_idx,
                        "is_primary": is_primary,
                    }
                },
            )
            succ_idx += 1
    return {"success": True}


@router.put("/beneficiaries/{beneficiary_id}/toggle-succession")
async def toggle_succession(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle a beneficiary in/out of the succession hierarchy."""
    require_benefactor_role(current_user, "modify succession hierarchy")

    ben = await db.beneficiaries.find_one(
        {"id": beneficiary_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "succession_order": 1,
            "is_primary": 1,
        },
    )
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    estate_id = ben["estate_id"]
    currently_in = ben.get("succession_order") is not None

    if currently_in:
        # Opt OUT — remove from succession chain
        was_primary = ben.get("is_primary", False)
        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {"$set": {"succession_order": None, "is_primary": False}},
        )
        # Re-index remaining chain to close the gap
        remaining = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "succession_order": {"$ne": None},
                "id": {"$ne": beneficiary_id},
            },
            {"_id": 0, "id": 1, "succession_order": 1},
        ).to_list(100)
        remaining.sort(key=lambda b: b["succession_order"])
        for new_idx, b in enumerate(remaining):
            await db.beneficiaries.update_one(
                {"id": b["id"]},
                {"$set": {"succession_order": new_idx, "is_primary": new_idx == 0}},
            )
        return {"success": True, "in_succession": False, "was_primary": was_primary}
    else:
        # Opt IN — append to the end of the chain
        max_order = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "succession_order": {"$ne": None},
            },
            {"_id": 0, "id": 1, "succession_order": 1},
        ).to_list(100)
        next_order = max(b["succession_order"] for b in max_order) + 1 if max_order else 0
        is_primary = next_order == 0
        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {"$set": {"succession_order": next_order, "is_primary": is_primary}},
        )
        return {"success": True, "in_succession": True, "is_primary": is_primary}


@router.put("/beneficiaries/{beneficiary_id}/toggle-legal")
async def toggle_legal_beneficiary(
    beneficiary_id: str, current_user: dict = Depends(get_current_user)
):
    """Toggle a beneficiary's estate classification between Primary (legal
    estate beneficiary — named in will/trust/beneficiary-designation drafts)
    and Secondary (CarryOn-platform recipient only — MM / IAC / FFN).

    Multiple beneficiaries may be Primary and multiple may be Secondary; this
    is a per-person flag, not a single-slot ladder (founder rule, May 28 2026).
    """
    require_benefactor_role(current_user, "classify beneficiaries")

    ben = await db.beneficiaries.find_one(
        {"id": beneficiary_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "is_legal_beneficiary": 1,
            "is_primary": 1,
            "succession_order": 1,
        },
    )
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    # IDOR guard — only the estate owner (or admin) can reclassify.
    await require_estate_owner(ben.get("estate_id"), current_user)

    # Resolve the current effective value. Legacy records (flag absent) treat
    # the rank-0 / is_primary record as legal for backward compatibility.
    current = ben.get("is_legal_beneficiary")
    if current is None:
        current = bool(ben.get("is_primary")) or ben.get("succession_order") == 0

    new_val = not current
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {"is_legal_beneficiary": new_val}},
    )
    return {"success": True, "is_legal_beneficiary": new_val}


@router.get("/beneficiaries/{estate_id}/succession")
async def get_succession_order(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get the succession hierarchy for an estate, ordered by succession_order."""
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "relation": 1,
            "succession_order": 1,
            "is_primary": 1,
        },
    ).to_list(100)
    # Sort: those with succession_order first (by order), then those without
    with_order = sorted(
        [b for b in beneficiaries if b.get("succession_order") is not None],
        key=lambda b: b["succession_order"],
    )
    without_order = [b for b in beneficiaries if b.get("succession_order") is None]
    return with_order + without_order


@router.post("/beneficiaries/force-link")
async def force_link_beneficiary(data: ForceLinkRequest, current_user: dict = Depends(get_current_user)):
    """Admin-only: manually link a beneficiary record to a user account by username or email."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Only admins can force-link beneficiaries.")

    # Find the beneficiary record
    ben = await db.beneficiaries.find_one({"id": data.beneficiary_id}, {"_id": 0})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary record not found.")

    # Find the user by username or email (case-insensitive)
    identifier = data.username_or_email.strip().lower()
    target_user = await db.users.find_one({"username_lower": identifier}, {"_id": 0})
    if not target_user:
        target_user = await db.users.find_one(
            {"email": {"$regex": f"^{identifier}$", "$options": "i"}},
            {"_id": 0},
        )
    if not target_user:
        raise HTTPException(status_code=404, detail=f"No user found with username or email '{data.username_or_email}'.")

    target_id = target_user["id"]

    # Link the beneficiary record
    await db.beneficiaries.update_one(
        {"id": data.beneficiary_id},
        {"$set": {"user_id": target_id, "invitation_status": "accepted"}},
    )

    # Add user to estate's beneficiaries array
    if ben.get("estate_id"):
        await db.estates.update_one(
            {"id": ben["estate_id"]},
            {"$addToSet": {"beneficiaries": target_id}},
        )

    # Set is_also_beneficiary if user is a benefactor
    if target_user.get("role") == "benefactor":
        await db.users.update_one(
            {"id": target_id},
            {"$set": {"is_also_beneficiary": True}},
        )

    logger.info(
        f"Admin {current_user['id']} force-linked beneficiary {data.beneficiary_id} "
        f"to user {target_id} ({target_user.get('username', target_user.get('email'))})"
    )

    return {
        "message": f"Successfully linked {ben.get('name', 'beneficiary')} to user {target_user.get('name', target_user.get('username'))}.",
        "beneficiary_id": data.beneficiary_id,
        "user_id": target_id,
        "user_name": target_user.get("name"),
        "user_email": target_user.get("email"),
    }
