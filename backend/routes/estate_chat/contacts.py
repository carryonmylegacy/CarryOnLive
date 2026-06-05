"""Estate Chat — contacts directory."""

from ._core import router, _get_user_estate_ids, _estate_chat_section_enabled
from fastapi import Depends
from utils import get_current_user
from config import db
from services.photo_urls import resolve_photo_url
from services.access_control import resolve_estate_actor, beneficiary_can_view_ffn


@router.get("/estate-chat/contacts")
async def get_contacts(current_user: dict = Depends(get_current_user)):
    """Get all people connected to the user across all estates, grouped by estate."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    result = []
    for eid in estate_ids:
        # Skip estates whose Messages section is disabled for this beneficiary
        # (audit 18a9d44 F-18-05). Owner/admin always pass.
        if not await _estate_chat_section_enabled(eid, current_user):
            continue
        estate = await db.estates.find_one(
            {"id": eid}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "beneficiaries": 1}
        )
        if not estate:
            continue
        all_member_ids = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
        all_member_ids = [m for m in all_member_ids if m != current_user["id"]]
        if not all_member_ids:
            continue
        users = await db.users.find(
            {"id": {"$in": all_member_ids}},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "photo_url": 1},
        ).to_list(100)
        # Get relationship info from beneficiaries collection
        ben_records = await db.beneficiaries.find(
            {"estate_id": eid, "user_id": {"$in": all_member_ids}, "deleted_at": None},
            {"_id": 0, "id": 1, "user_id": 1, "relation": 1, "photo_url": 1},
        ).to_list(100)
        relation_map = {b["user_id"]: b.get("relation", "") for b in ben_records}
        ben_photo_map = {b["user_id"]: b["photo_url"] for b in ben_records if b.get("photo_url")}
        members = []
        for u in users:
            is_owner = u["id"] == estate["owner_id"]
            # Use user photo first, fall back to beneficiary record photo
            photo = u.get("photo_url", "") or ben_photo_map.get(u["id"], "")
            members.append(
                {
                    "id": u["id"],
                    "name": u.get("name", "Unknown"),
                    "photo_url": resolve_photo_url(photo),
                    "role_in_estate": "benefactor" if is_owner else "beneficiary",
                    "relation": relation_map.get(u["id"], "benefactor" if is_owner else ""),
                }
            )
        result.append(
            {
                "estate_id": eid,
                "estate_name": estate.get("name", "Estate"),
                "members": members,
            }
        )
        # Include FFN contacts as external members — only for actors entitled to
        # the FFN roster (post-transition + ffn_access). Pre-transition
        # beneficiaries never see the external contact roster (audit 05c1776 P1.1).
        actor = await resolve_estate_actor(eid, current_user)
        if not beneficiary_can_view_ffn(actor):
            continue
        ffn_contacts = await db.ffn_contacts.find(
            {"estate_id": eid, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "relationship": 1},
        ).to_list(100)
        for fc in ffn_contacts:
            result[-1]["members"].append(
                {
                    "id": f"ffn_{fc['id']}",
                    "name": fc.get("name", "Unknown"),
                    "photo_url": "",
                    "role_in_estate": "ffn",
                    "relation": fc.get("relationship", "FFN Contact"),
                    "is_ffn": True,
                    "email": fc.get("email", ""),
                    "phone": fc.get("phone", ""),
                }
            )
    return result
