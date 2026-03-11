"""CarryOn™ Backend — Estate Routes"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from models import Estate, EstateCreate, EstateUpdate
from services.encryption import generate_estate_salt
from services.readiness import calculate_estate_readiness, ensure_default_checklist
from utils import get_current_user, log_activity

router = APIRouter()

# ===================== ESTATE ROUTES =====================


@router.get("/estates")
async def get_estates(current_user: dict = Depends(get_current_user)):
    """List all estates for the current user. Annotates each with `user_role_in_estate`
    so the frontend knows whether the user is 'owner' or 'beneficiary' in each estate."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    is_also_benefactor = (user or {}).get("is_also_benefactor", False)
    is_also_beneficiary = (user or {}).get("is_also_beneficiary", False)

    if current_user["role"] == "admin":
        estates = await db.estates.find({}, {"_id": 0}).to_list(100)
        return estates

    estates = []
    seen_ids = set()

    # Always fetch estates the user OWNS (regardless of primary role)
    if current_user["role"] == "benefactor" or is_also_benefactor:
        owned = await db.estates.find(
            {"owner_id": current_user["id"]}, {"_id": 0}
        ).to_list(100)
        for e in owned:
            e["user_role_in_estate"] = "owner"
            estates.append(e)
            seen_ids.add(e["id"])

    # Always fetch estates they're a BENEFICIARY of (regardless of primary role)
    if current_user["role"] == "beneficiary" or is_also_beneficiary:
        ben_estates = await db.estates.find(
            {"beneficiaries": current_user["id"]}, {"_id": 0}
        ).to_list(100)
        for be in ben_estates:
            if be["id"] not in seen_ids:
                # Enrich with benefactor photo
                override = await db.beneficiary_display_overrides.find_one(
                    {"user_id": current_user["id"], "estate_id": be["id"]},
                    {"_id": 0, "owner_photo_url": 1},
                )
                if override and override.get("owner_photo_url"):
                    be["owner_photo_url"] = override["owner_photo_url"]
                else:
                    owner = await db.users.find_one(
                        {"id": be.get("owner_id")},
                        {"_id": 0, "photo_url": 1, "name": 1},
                    )
                    if owner and owner.get("photo_url"):
                        be["owner_photo_url"] = owner["photo_url"]
                    if owner and owner.get("name"):
                        be["benefactor_name"] = owner["name"]
                be["user_role_in_estate"] = "beneficiary"
                be["is_beneficiary_estate"] = True
                estates.append(be)
                seen_ids.add(be["id"])

    # Fallback for benefactors without is_also_beneficiary flag but still linked
    if current_user["role"] == "benefactor" and not is_also_beneficiary:
        ben_estates = await db.estates.find(
            {"beneficiaries": current_user["id"]}, {"_id": 0}
        ).to_list(100)
        for be in ben_estates:
            if be["id"] not in seen_ids:
                owner = await db.users.find_one(
                    {"id": be.get("owner_id")}, {"_id": 0, "photo_url": 1, "name": 1}
                )
                if owner and owner.get("photo_url"):
                    be["owner_photo_url"] = owner["photo_url"]
                if owner and owner.get("name"):
                    be["benefactor_name"] = owner["name"]
                be["user_role_in_estate"] = "beneficiary"
                be["is_beneficiary_estate"] = True
                estates.append(be)
                seen_ids.add(be["id"])

    return estates


@router.get("/beneficiary/family-connections")
async def get_family_connections(current_user: dict = Depends(get_current_user)):
    """Get all family connections for a beneficiary with relationship data for orbit visualization"""
    # Allow both beneficiaries and benefactors who are also beneficiaries
    ben_records = await db.beneficiaries.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).to_list(100)
    if not ben_records:
        return []

    connections = []
    for ben_record in ben_records:
        # Get the estate
        estate = await db.estates.find_one({"id": ben_record["estate_id"]}, {"_id": 0})
        if not estate:
            continue

        # Get the benefactor (estate owner)
        benefactor = await db.users.find_one(
            {"id": estate.get("owner_id")}, {"_id": 0, "password": 0}
        )
        if not benefactor:
            continue

        # Check for beneficiary display override (beneficiary-side only, never touches benefactor)
        override = await db.beneficiary_display_overrides.find_one(
            {"user_id": current_user["id"], "estate_id": estate["id"]},
            {"_id": 0, "owner_photo_url": 1},
        )
        display_photo = (
            override.get("owner_photo_url", "")
            if override and override.get("owner_photo_url")
            else benefactor.get("photo_url", "")
        )

        # Combine estate and relationship info
        connections.append(
            {
                "id": estate["id"],
                "estate_id": estate["id"],
                "name": benefactor.get("name", "Unknown"),
                "first_name": benefactor.get("first_name"),
                "last_name": benefactor.get("last_name"),
                "relation": ben_record.get("relation", "Other"),
                "status": estate.get("status", "pre-transition"),
                "readiness_score": estate.get("readiness_score", 0),
                "benefactor_id": benefactor.get("id"),
                "photo_url": display_photo,
            }
        )

    return connections


class DisplayOverrideUpdate(BaseModel):
    estate_id: str
    owner_photo_url: str


@router.put("/beneficiary/display-override")
async def update_display_override(
    data: DisplayOverrideUpdate, current_user: dict = Depends(get_current_user)
):
    """Beneficiary sets a display override for how they see a benefactor's photo.
    This NEVER modifies the benefactor's actual data — it's stored separately
    in beneficiary_display_overrides and only affects the beneficiary's view."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(
            status_code=403, detail="Only beneficiaries can set display overrides"
        )

    # Verify this user is actually a beneficiary of this estate
    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0})
    if not estate or current_user["id"] not in (estate.get("beneficiaries") or []):
        raise HTTPException(status_code=403, detail="Not a beneficiary of this estate")

    await db.beneficiary_display_overrides.update_one(
        {"user_id": current_user["id"], "estate_id": data.estate_id},
        {
            "$set": {
                "user_id": current_user["id"],
                "estate_id": data.estate_id,
                "owner_photo_url": data.owner_photo_url,
            }
        },
        upsert=True,
    )
    return {"success": True}


class EstatePhotoUpdate(BaseModel):
    photo_data: str
    file_name: str = "estate_photo.jpg"


@router.put("/estates/{estate_id}/photo")
async def update_estate_photo(
    estate_id: str,
    data: EstatePhotoUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Set the estate photo — benefactor only (owner of the estate).
    This is separate from the benefactor's personal profile photo."""
    import base64

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    if estate.get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Only the estate owner can set the estate photo"
        )

    if not data.photo_data:
        # Remove estate photo
        await db.estates.update_one(
            {"id": estate_id}, {"$unset": {"estate_photo_url": ""}}
        )
        return {"estate_photo_url": ""}

    try:
        raw = base64.b64decode(data.photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB")

    ext = data.file_name.rsplit(".", 1)[-1].lower() if "." in data.file_name else "jpg"
    mime = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
    }.get(ext, "image/jpeg")
    data_url = f"data:{mime};base64,{data.photo_data}"

    await db.estates.update_one(
        {"id": estate_id}, {"$set": {"estate_photo_url": data_url}}
    )
    return {"estate_photo_url": data_url}


@router.get("/estates/{estate_id}")
async def get_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single estate by ID."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check access — based on actual relationship, not just role
    is_owner = estate["owner_id"] == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user["role"] in ("admin", "operator")
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    return estate


@router.post("/beneficiary/become-benefactor")
async def beneficiary_become_benefactor(current_user: dict = Depends(get_current_user)):
    """Legacy endpoint — redirects to the new create-estate flow.
    Kept for backwards compatibility but the frontend should use /accounts/create-estate."""
    raise HTTPException(
        status_code=400,
        detail="Please use the Create Estate wizard to set up your estate plan.",
    )


class CreateEstateRequest(BaseModel):
    """Request to create an estate for an existing authenticated user."""

    beneficiary_enrollments: list = []  # [{first_name, last_name, email, dob, relation, ...}]
    special_status: list = None  # ['military', 'veteran', 'hospice', 'enterprise', ...]
    b2b_code: str = None


@router.post("/accounts/create-estate")
async def create_estate_for_existing_user(
    data: CreateEstateRequest, current_user: dict = Depends(get_current_user)
):
    """Create a new estate for an existing user WITHOUT changing their primary role.
    Works for both beneficiaries wanting to become benefactors AND benefactors creating additional estates.
    Sets is_also_benefactor=True so the user retains their original role but gains estate ownership."""
    import uuid
    from datetime import datetime, timezone

    if current_user["role"] in ("admin", "operator"):
        raise HTTPException(
            status_code=400, detail="Staff accounts cannot create estate plans"
        )

    # Check if they already own an estate
    existing = await db.estates.find_one(
        {"owner_id": current_user["id"]},
        {"_id": 0, "id": 1, "status": 1, "beneficiaries": 1, "created_at": 1},
    )
    if existing:
        # Auto-clean ghost estates: if the estate has no beneficiaries, no vault
        # items, is still in pre-transition, and was created >2 minutes ago, it's
        # an orphaned/failed creation.  Delete it so the user can start fresh.
        bens_in_estate = existing.get("beneficiaries") or []
        ben_docs_count = await db.beneficiaries.count_documents(
            {"estate_id": existing["id"]}
        )
        vault_count = await db.vault_items.count_documents(
            {"estate_id": existing["id"]}
        )
        is_empty = len(bens_in_estate) == 0 and ben_docs_count == 0 and vault_count == 0
        is_ghost = is_empty and existing.get("status") == "pre-transition"

        if is_ghost:
            await db.estates.delete_one({"id": existing["id"]})
            await db.vault_items.delete_many({"estate_id": existing["id"]})
            await db.checklist_items.delete_many({"estate_id": existing["id"]})
            await db.activity_logs.delete_many({"estate_id": existing["id"]})
        else:
            raise HTTPException(
                status_code=400,
                detail="You already have an estate plan. Go to your Dashboard to manage it.",
            )

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    last_name = user.get(
        "last_name", user.get("name", "").split()[-1] if user.get("name") else "Family"
    )

    # Create estate
    estate_id = str(uuid.uuid4())
    estate = {
        "id": estate_id,
        "owner_id": current_user["id"],
        "name": f"{last_name} Family Estate",
        "status": "pre-transition",
        "beneficiaries": [],
        "encryption_salt": generate_estate_salt().hex(),
        "created_at": now.isoformat(),
    }
    await db.estates.insert_one(estate)

    # Mark user as also being a benefactor — DO NOT change their primary role
    update_fields = {"is_also_benefactor": True}
    if current_user["role"] == "beneficiary":
        update_fields["benefactor_since"] = now.isoformat()

    # Save special eligibility status if provided
    special_statuses = data.special_status or []
    if special_statuses:
        eligible_tier = None
        if user.get("date_of_birth"):
            try:
                dob = datetime.fromisoformat(user["date_of_birth"])
                age = (now - dob.replace(tzinfo=timezone.utc)).days // 365
                if 18 <= age <= 25:
                    eligible_tier = "new_adult"
            except (ValueError, TypeError):
                pass
        if any(
            s in special_statuses
            for s in ["military", "first_responder", "federal_agent"]
        ):
            eligible_tier = "military"
        elif "veteran" in special_statuses:
            eligible_tier = "veteran"
        elif "hospice" in special_statuses:
            eligible_tier = "hospice"
        elif "enterprise" in special_statuses:
            eligible_tier = "enterprise"
        update_fields["special_status"] = special_statuses
        if eligible_tier:
            update_fields["eligible_tier"] = eligible_tier

    # Handle B2B enterprise code verification
    if data.b2b_code and "enterprise" in special_statuses:
        update_fields["b2b_code"] = data.b2b_code

    await db.users.update_one({"id": current_user["id"]}, {"$set": update_fields})

    # Process beneficiary enrollments — wrapped so partial failures don't lose the estate
    auto_linked_users = []
    logger.info(
        f"Estate {estate_id}: received {len(data.beneficiary_enrollments)} enrollment(s): "
        f"{[b.get('first_name', '?') for b in data.beneficiary_enrollments]}"
    )
    try:
        avatar_colors = [
            "#d4af37",
            "#3b82f6",
            "#10b981",
            "#8b5cf6",
            "#ef4444",
            "#f59e0b",
            "#ec4899",
            "#06b6d4",
        ]
        beneficiaries_to_insert = []

        for i, ben in enumerate(data.beneficiary_enrollments):
            first = (ben.get("first_name") or "").strip()
            middle = (ben.get("middle_name") or "").strip()
            last = (ben.get("last_name") or last_name).strip()
            ben_email = (ben.get("email") or "").strip().lower()
            initials = (
                (first[0] if first else "?") + (last[0] if last else "?")
            ).upper()
            full_name = " ".join(p for p in [first, middle, last] if p)

            # Check if this email already has an account — auto-link if so
            existing_user = None
            if ben_email:
                existing_user = await db.users.find_one(
                    {"email": ben_email}, {"_id": 0, "id": 1, "name": 1, "role": 1}
                )

            ben_record = {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "first_name": first,
                "middle_name": middle,
                "last_name": last,
                "name": full_name,
                "relation": ben.get("relation", ""),
                "email": ben_email,
                "date_of_birth": ben.get("dob"),
                "gender": ben.get("gender"),
                "initials": initials,
                "avatar_color": avatar_colors[i % len(avatar_colors)],
                "invitation_status": "accepted"
                if existing_user
                else ("pending" if ben_email else "draft"),
                "is_stub": not bool(first),
                "address_street": ben.get("address_street"),
                "address_city": ben.get("address_city"),
                "address_state": ben.get("address_state"),
                "address_zip": ben.get("address_zip"),
                "created_at": now.isoformat(),
            }

            if existing_user:
                ben_record["user_id"] = existing_user["id"]
                await db.estates.update_one(
                    {"id": estate_id},
                    {"$addToSet": {"beneficiaries": existing_user["id"]}},
                )
                auto_linked_users.append(
                    {
                        "email": ben_email,
                        "name": existing_user.get("name", full_name),
                        "existing_role": existing_user.get("role", ""),
                    }
                )

            beneficiaries_to_insert.append(ben_record)

        if beneficiaries_to_insert:
            await db.beneficiaries.insert_many(beneficiaries_to_insert)
            logger.info(
                f"Estate {estate_id}: enrolled {len(beneficiaries_to_insert)} beneficiaries"
            )
    except Exception as e:
        logger.error(f"Error enrolling beneficiaries for estate {estate_id}: {e}")

    # Seed default checklist (non-critical — don't fail the estate creation)
    default_checklist = [
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Call your designated executor — they have instructions",
            "description": "Your first call should be to the person you've designated to handle your estate. Edit this item to add their name and phone number.",
            "category": "immediate",
            "priority": "critical",
            "order": 1,
            "is_default": True,
            "activation_status": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Contact employer HR to report the death and ask about benefits",
            "description": "Life insurance through work, final paycheck, COBRA health coverage, and any survivor benefits.",
            "category": "immediate",
            "priority": "critical",
            "order": 2,
            "is_default": True,
            "activation_status": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Request 10 certified copies of the death certificate",
            "description": "Banks, insurance companies, and government agencies each require an original. Most families don't request enough.",
            "category": "immediate",
            "priority": "high",
            "order": 3,
            "is_default": True,
            "activation_status": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Freeze or monitor all joint financial accounts",
            "description": "Notify banks of the death. Prevent unauthorized transactions. Do not close accounts until the executor advises.",
            "category": "immediate",
            "priority": "high",
            "order": 4,
            "is_default": True,
            "activation_status": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Do NOT make any major financial decisions for 30 days",
            "description": "Grief impairs judgment. Avoid selling property, changing investments, or lending money during the initial period.",
            "category": "immediate",
            "priority": "high",
            "order": 5,
            "is_default": True,
            "activation_status": None,
            "created_at": now.isoformat(),
        },
    ]
    try:
        await db.checklists.insert_many(default_checklist)
    except Exception as e:
        logger.error(f"Error seeding checklist for estate {estate_id}: {e}")

    ben_count = await db.beneficiaries.count_documents({"estate_id": estate_id})
    return {
        "success": True,
        "estate_id": estate_id,
        "auto_linked": auto_linked_users,
        "beneficiaries_enrolled": ben_count,
        "message": "Your estate has been created successfully.",
    }


class AddBeneficiaryLinkRequest(BaseModel):
    """Request to link self as beneficiary to another estate."""

    benefactor_email: str


@router.post("/accounts/add-beneficiary-link")
async def add_beneficiary_link(
    data: AddBeneficiaryLinkRequest, current_user: dict = Depends(get_current_user)
):
    """Link authenticated user as beneficiary to another estate by benefactor email.
    Does NOT change user role. Sets is_also_beneficiary flag if they're a benefactor."""
    import uuid
    from datetime import datetime, timezone

    benefactor_email = data.benefactor_email.lower().strip()

    # Find the benefactor
    benefactor = await db.users.find_one(
        {"email": benefactor_email}, {"_id": 0, "id": 1, "name": 1}
    )
    if not benefactor:
        raise HTTPException(
            status_code=404, detail="No benefactor found with that email address."
        )

    # Find their estate
    estate = await db.estates.find_one(
        {"owner_id": benefactor["id"]},
        {"_id": 0, "id": 1, "beneficiaries": 1, "name": 1},
    )
    if not estate:
        raise HTTPException(
            status_code=404, detail="No estate found for that benefactor."
        )

    # Check if already linked
    if current_user["id"] in estate.get("beneficiaries", []):
        raise HTTPException(
            status_code=400,
            detail=f"You are already a beneficiary of {estate.get('name', 'this estate')}.",
        )

    now = datetime.now(timezone.utc)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    full_name = user.get("name", "")
    first_name = user.get("first_name", "")
    last_name = user.get("last_name", "")

    # Add to estate's beneficiaries list
    await db.estates.update_one(
        {"id": estate["id"]},
        {"$addToSet": {"beneficiaries": current_user["id"]}},
    )

    # Link to existing beneficiary record or create one
    existing_ben = await db.beneficiaries.find_one(
        {"estate_id": estate["id"], "email": user.get("email", "")}, {"_id": 0}
    )
    if existing_ben:
        await db.beneficiaries.update_one(
            {"id": existing_ben["id"]},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "invitation_status": "accepted",
                    "name": full_name,
                    "first_name": first_name,
                    "last_name": last_name,
                    "is_stub": False,
                }
            },
        )
    else:
        await db.beneficiaries.insert_one(
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate["id"],
                "user_id": current_user["id"],
                "first_name": first_name,
                "last_name": last_name,
                "name": full_name,
                "email": user.get("email", ""),
                "relation": "",
                "initials": (
                    (first_name[0] if first_name else "?")
                    + (last_name[0] if last_name else "?")
                ).upper(),
                "avatar_color": "#60A5FA",
                "invitation_status": "accepted",
                "is_stub": False,
                "created_at": now.isoformat(),
            }
        )

    # Mark user as also being a beneficiary if they're a benefactor
    if current_user["role"] == "benefactor":
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"is_also_beneficiary": True}},
        )

    return {
        "success": True,
        "estate_name": estate.get("name", ""),
        "message": f"You have been linked as a beneficiary to {estate.get('name', 'the estate')}.",
    }


@router.post("/estates")
async def create_estate(
    data: EstateCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new estate."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can create estates"
        )

    estate = Estate(owner_id=current_user["id"], name=data.name)
    estate_dict = estate.model_dump()
    # Generate per-estate encryption salt for AES-256-GCM
    estate_dict["encryption_salt"] = generate_estate_salt().hex()
    await db.estates.insert_one(estate_dict)

    # Log activity
    await log_activity(
        estate_id=estate.id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="estate_created",
        description=f"Created estate: {data.name}",
    )

    # Create default checklist items for new estate
    await ensure_default_checklist(estate.id)

    return estate


@router.patch("/estates/{estate_id}")
async def update_estate(
    estate_id: str, data: EstateUpdate, current_user: dict = Depends(get_current_user)
):
    """Update an existing estate."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can update estates"
        )

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.description:
        update_data["description"] = data.description
    if data.state is not None:
        update_data["state"] = data.state

    if update_data:
        await db.estates.update_one({"id": estate_id}, {"$set": update_data})
        await log_activity(
            estate_id=estate_id,
            user_id=current_user["id"],
            user_name=current_user["name"],
            action="estate_updated",
            description="Updated estate settings",
        )

    return {"message": "Estate updated"}


@router.delete("/estates/{estate_id}")
async def delete_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an estate and all associated data."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete estates"
        )

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete all related data
    await db.documents.delete_many({"estate_id": estate_id})
    await db.messages.delete_many({"estate_id": estate_id})
    await db.beneficiaries.delete_many({"estate_id": estate_id})
    await db.checklists.delete_many({"estate_id": estate_id})
    await db.activity_logs.delete_many({"estate_id": estate_id})
    await db.estates.delete_one({"id": estate_id})

    return {"message": "Estate deleted"}


# ===================== READINESS SCORE ROUTES =====================


@router.get("/estate/{estate_id}/readiness")
async def get_estate_readiness(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get detailed estate readiness score breakdown"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Ensure default checklist exists
    await ensure_default_checklist(estate_id)

    # Calculate fresh readiness
    result = await calculate_estate_readiness(estate_id)

    # Persist updated score
    await db.estates.update_one(
        {"id": estate_id},
        {
            "$set": {
                "readiness_score": result["overall_score"],
                "readiness_breakdown": {
                    "documents": result["documents"],
                    "messages": result["messages"],
                    "checklist": result["checklist"],
                },
            }
        },
    )

    return result


@router.post("/estate/{estate_id}/readiness")
async def recalculate_estate_readiness(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Recalculate and return estate readiness score"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    await ensure_default_checklist(estate_id)
    result = await calculate_estate_readiness(estate_id)

    await db.estates.update_one(
        {"id": estate_id},
        {
            "$set": {
                "readiness_score": result["overall_score"],
                "readiness_breakdown": {
                    "documents": result["documents"],
                    "messages": result["messages"],
                    "checklist": result["checklist"],
                },
            }
        },
    )

    return result


# ===================== ACTIVITY LOG ROUTES =====================


@router.get("/activity/{estate_id}")
async def get_activity_log(
    estate_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)
):
    """Get activity log for an estate"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check access — based on actual relationship, not just role
    is_owner = estate["owner_id"] == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user.get("role") == "admin"
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    activities = (
        await db.activity_logs.find({"estate_id": estate_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
        .to_list(limit)
    )

    return activities
