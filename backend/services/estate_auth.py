"""
CarryOn™ — Shared estate authorization helpers.
Used by estate_chat.py, connected_protocol.py, and other estate-scoped routes.
"""

from config import db


async def is_estate_member(user_id: str, estate_id: str) -> bool:
    """Check if user is owner or accepted beneficiary of an estate."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "beneficiaries": 1})
    if not estate:
        return False
    if estate["owner_id"] == user_id:
        return True
    return user_id in estate.get("beneficiaries", [])


async def is_estate_owner(user_id: str, estate_id: str) -> bool:
    """Check if user is the owner (benefactor) of an estate, or an admin."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1})
    if not estate:
        return False
    if estate["owner_id"] == user_id:
        return True
    # Admin users can act as estate owners across all estates
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    return user is not None and user.get("role") == "admin"
